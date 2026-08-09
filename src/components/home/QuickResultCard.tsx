import { CloudRain, MapPin, PackageCheck, ShoppingBasket } from "lucide-react";
import type { DemoTaskKind } from "./presentation";

interface QuickResultCardProps {
  kind: DemoTaskKind;
}

export function QuickResultCard({ kind }: QuickResultCardProps) {
  if (kind === "pupu_order") {
    return (
      <article className="quick-card" aria-label="朴朴订单查询结果">
        <div className="quick-card__meta">
          <span>朴朴订单</span>
          <small>示例数据</small>
        </div>
        <div className="quick-card__title-row">
          <ShoppingBasket size={21} strokeWidth={1.7} aria-hidden="true" />
          <div>
            <h2>朴朴订单正在配送</h2>
            <p>鲜牛奶、鸡蛋等 6 件商品</p>
          </div>
        </div>
        <strong className="quick-card__eta">预计 18:42 前送达</strong>
        <ol className="parcel-route">
          <li>
            <b>骑手已取货</b>
            <span>正在前往收货地址 · 18:18</span>
          </li>
          <li>
            <b>门店完成打包</b>
            <span>商品已复核 · 18:09</span>
          </li>
        </ol>
      </article>
    );
  }

  if (kind === "weather") {
    return (
      <article className="quick-card" aria-label="天气查询结果">
        <div className="quick-card__meta">
          <span>天气</span>
          <small>示例数据</small>
        </div>
        <div className="quick-card__title-row">
          <CloudRain size={21} strokeWidth={1.7} aria-hidden="true" />
          <div>
            <h2>今晚有短时阵雨</h2>
            <p>18:00 后降雨概率升高，出门记得带伞。</p>
          </div>
        </div>
        <div className="weather-strip" aria-label="天气详情">
          <span><b>27°</b>当前</span>
          <span><b>68%</b>降雨</span>
          <span><b>东南风</b>2 级</span>
        </div>
      </article>
    );
  }

  if (kind === "delivery") {
    return (
      <article className="quick-card" aria-label="外卖进度查询结果">
        <div className="quick-card__meta">
          <span>外卖进度</span>
          <small>示例数据</small>
        </div>
        <div className="quick-card__title-row">
          <MapPin size={21} strokeWidth={1.7} aria-hidden="true" />
          <div>
            <h2>骑手正在前往商家</h2>
            <p>预计 19:10 送达，餐厅正在打包最后一份餐品。</p>
          </div>
        </div>
        <div className="delivery-progress" aria-label="配送进度">
          <span className="is-complete">已接单</span>
          <span className="is-active">取餐中</span>
          <span>配送</span>
        </div>
      </article>
    );
  }

  return (
    <article className="quick-card" aria-label="快递查询结果">
      <div className="quick-card__meta">
        <span>快递查询</span>
        <small>示例数据</small>
      </div>
      <div className="quick-card__title-row">
        <PackageCheck size={21} strokeWidth={1.7} aria-hidden="true" />
        <div>
          <h2>你的包裹正在派送</h2>
          <p>顺丰速运 SF1382</p>
        </div>
      </div>
      <strong className="quick-card__eta">预计今天 14:30 前送达</strong>
      <ol className="parcel-route">
        <li>
          <b>福州鼓楼营业点</b>
          <span>快递员正在为你派送 · 10:26</span>
        </li>
        <li>
          <b>福州转运中心</b>
          <span>已完成分拣 · 07:48</span>
        </li>
      </ol>
    </article>
  );
}
