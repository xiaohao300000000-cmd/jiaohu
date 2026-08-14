# LiquidJourney + Hermes + Pupu

LiquidJourney 是一个由 Agent 主控、PostgreSQL TaskSnapshot 作为唯一业务事实源的生活任务系统。

- **Agent 是司机：**理解用户目标、制定步骤、选择商品与能力、处理修改，并组合多个 provider。
- **TaskCoordinator 是交通规则、仪表盘与安全锁：**校验阶段转换、能力白名单、确认要求和版本，不解析自然语言，也不持有状态。
- **PostgreSQL 是唯一业务状态中心：**Task、地址绑定、候选商品、FinalPlan、确认和幂等结果都可跨重启与多实例恢复。
- **Hermes 是执行 Agent：**读取完整的安全 TaskSnapshot，搜索真实商品并提交结构化 FinalPlan。
- **外部 Pupu CLI 是 provider 边界：**仓库不吸收底层签名或协议逻辑。

## 单一事实流

```text
用户输入
  -> HermesTaskAgent 提交结构化 TaskProposal
  -> TaskCoordinator 校验业务阶段与能力规则
  -> PostgreSQL CAS 写入 TaskSnapshot
  -> UI、Hermes、购物车和 Checkout 读取同一 TaskSnapshot
```

商品搜索结果先写入 `task_product_candidates`，不会自动成为“已选商品”。只有 Hermes 的结构化 `submit_final_plan` 通过候选身份、库存、任务版本和数据库价格校验后，服务器才写入：

```text
final_plans + final_plan_items
  -> TaskSnapshot.finalPlan
  -> TaskSnapshot.context.selectedProducts
  -> UI 展示
  -> 购物车预览/写入
  -> Checkout 核对/创建订单
```

`run.completed.summary` 仅用于展示文案，不能选择、删除、排序商品，也不能修改价格或数量。

## 安全阶段

| Task phase | 允许能力 | 真实影响 |
| --- | --- | --- |
| `advising` | 普通建议/只读回答 | 无 |
| `searching_catalog` | 商品搜索 + 结构化方案提交 | 只读 |
| `editing_plan` | 修改并重新提交 FinalPlan | 无 |
| `awaiting_cart_confirmation` | 生成 PostgreSQL cart confirmation | 无 |
| `writing_cart` | 消费匹配的确认记录并写购物车 | 真实写入 |
| `awaiting_order_confirmation` | 读取结算并生成 checkout confirmation | 只读 |
| `creating_order` | 消费匹配的确认记录并创建待付款订单 | 创建订单 |
| `awaiting_payment` | 展示官方支付入口/读取状态 | 不自动付款 |

浏览器的 commerce 请求只提交 `taskId`、`taskVersion`、`confirmationId` 和幂等键。商品、价格、FinalPlan、数量和地址全部从 PostgreSQL 重新读取。自然语言中的“确认”不会授权真实操作。

## PostgreSQL

生产环境必须设置：

```dotenv
DATABASE_URL=postgresql:///jiaohu_task_state?host=/var/run/postgresql
DATABASE_POOL_MAX=4
```

参考 [deploy/postgres/env.example](deploy/postgres/env.example)。启动顺序固定为：

1. 创建连接池；
2. 在 advisory lock 下执行 migration；
3. 执行 `SELECT 1` 健康检查；
4. 构造 repository、规则层和应用服务；
5. 通过后才监听端口。

数据库不可用时不会回退到内存 Task store。

检查就绪状态：

```bash
DATABASE_URL='postgresql:///jiaohu_task_state?host=/var/run/postgresql' \
  bash deploy/postgres/verify-readiness.sh
```

浏览器通过仅含随机 opaque ID 的 `lj_task_owner` HttpOnly cookie 绑定 Task owner；provider account、地址和业务内容不会写入该 cookie。

## 确认与幂等

`task_confirmations` 绑定以下全部事实：

- Task ID 和 Task version
- FinalPlan ID 和 plan version
- 地址 binding version
- provider payload 的规范化 SHA-256
- 确认类型、状态和到期时间

`idempotency_records` 以 provider account、operation 和 idempotency key 为主键。跨进程竞争只有一个 executor 能调用 provider；成功结果持久化并可原样重放。执行结果不确定时记录会阻止重复真实写入。

## Retention

显式维护命令：

```bash
npm run retention:tasks
```

每次最多处理 1000 行：

- 7 天以上、且未被任何 FinalPlan 引用的候选商品可删除；
- 已完成 Task 至少保留 30 天；
- 非终态且 90 天未更新的 Task 可删除；
- confirmation 和 idempotency 记录至少保留 30 天。

建议由 systemd timer 或同等外部调度器调用；不会在用户请求中同步清理。

## Pupu 环境

秘密只放在 VPS 服务环境，不能提交真实值：

```dotenv
DEEPSEEK_API_KEY=
API_SERVER_KEY=
HERMES_BASE_URL=http://127.0.0.1:8642
APP_PUBLIC_ORIGIN=https://your-host.example
PUPU_CLI_PATH=/home/pupu/providers/pupu-cli/.venv/bin/pupu
PUPU_DATA_DIR=/home/pupu/providers/pupu-cli/.local/private
PUPU_ACCOUNTS_ROOT=/home/pupu/.local/share/jiaohu/pupu-accounts
PUPU_LOGIN_RUNTIME_ROOT=/home/pupu/.local/state/jiaohu/pupu-login
PUPU_SCOPE_TICKET_DIR=/home/pupu/.local/state/jiaohu/pupu-login/scope-tickets
PUPU_RESULT_DIR=/home/pupu/.hermes/run-artifacts
PUPU_TOOL_TIMEOUT_SECONDS=150
```

## 验证边界

```bash
export TEST_DATABASE_URL='postgresql:///jiaohu_task_state_test?host=/var/run/postgresql'
npm test -- --maxWorkers=1
PYTHONPATH=. /home/pupu/providers/pupu-cli/.venv/bin/python -m pytest hermes/plugins/pupu_readonly/tests -q
npm run lint
npm run build
npm run test:browser
git diff --check
```

自动化测试只使用 fake provider，不会写真实购物车、创建真实订单或发起支付。除非另行明确授权，不运行 `test:live` 或真实 mutation 验收。
