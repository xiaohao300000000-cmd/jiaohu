import express from "express";
import { join } from "node:path";
import { createServer as createViteServer } from "vite";
import { handleChatRequest } from "./chat-handler";
import { getHermesConfig, getPupuLoginConfig } from "./config";
import { stopHermesRun } from "./hermes-client";
import { abortOnClientDisconnect } from "./request-lifecycle";
import { PupuSessionStore } from "./pupu/session-store";
import { PupuLoginController } from "./pupu/login-controller";
import { handlePupuLoginRequest } from "./pupu/login-router";
import { PupuScopeTicketStore } from "./pupu/scope-ticket";
import { readPupuSessionCookie } from "./pupu/http-security";
import { PupuAddressController } from "./pupu/address-controller";
import { handlePupuAddressRequest } from "./pupu/address-router";
import { PupuCartController } from "./pupu/cart-controller";
import { handlePupuCommerceRequest } from "./pupu/commerce-router";
import { PupuCheckoutController } from "./pupu/checkout-controller";
import { InMemoryTaskStore } from "./tasks/in-memory-task-store";
import { getDatabaseConfig } from "./db/config";
import { createDatabasePool } from "./db/pool";
import { migrate } from "./db/migrate";
import { TaskCoordinator } from "./tasks/task-coordinator";
import { PostgresTaskRepository } from "./tasks/task-repository";
import { TaskApplicationService } from "./tasks/task-application-service";
import { resolveTaskOwner } from "./tasks/task-owner";
import { handleTaskRequest } from "./tasks/task-router";

const app = express();
const host = process.env.APP_HOST || "127.0.0.1";
const port = Number(process.env.APP_PORT || 4173);

const loginConfig = getPupuLoginConfig();
const sessionStore = new PupuSessionStore({
  root: join(loginConfig.runtimeRoot, "sessions"),
  accountsRoot: loginConfig.accountsRoot,
});
const loginController = new PupuLoginController({
  attemptTtlMs: loginConfig.attemptTtlMs,
  resendCooldownMs: loginConfig.resendCooldownMs,
});
const scopeTickets = new PupuScopeTicketStore({
  root: join(loginConfig.runtimeRoot, "scope-tickets"),
  ttlMs: 120_000,
});
const addressController = new PupuAddressController();
const cartController = new PupuCartController();
const checkoutController = new PupuCheckoutController();
const databasePool = createDatabasePool(getDatabaseConfig());
await migrate(databasePool, join(process.cwd(), "server/db/migrations"));
const taskService = new TaskApplicationService(
  databasePool,
  new PostgresTaskRepository(),
  new TaskCoordinator(),
);
const taskCoordinator = new InMemoryTaskStore();

function requestHeaders(
  headers: express.Request["headers"],
): Headers {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) result.append(name, item);
    } else if (typeof value === "string") {
      result.set(name, value);
    }
  }
  return result;
}

async function sendWebResponse(
  webResponse: Response,
  response: express.Response,
): Promise<void> {
  response.status(webResponse.status);
  webResponse.headers.forEach((value, name) => response.setHeader(name, value));
  if (!webResponse.body) {
    response.end();
    return;
  }
  const reader = webResponse.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      response.write(Buffer.from(value));
    }
  } finally {
    response.end();
    reader.releaseLock();
  }
}

app.post(
  "/api/chat",
  express.raw({ type: "application/json", limit: "1mb" }),
  async (req, res) => {
    const controller = new AbortController();
    const stopWatching = abortOnClientDisconnect(req, res, controller);
    const request = new Request(
      `http://${req.headers.host || "localhost"}${req.originalUrl}`,
      {
        method: "POST",
        headers: requestHeaders(req.headers),
        body: req.body,
        signal: controller.signal,
      },
    );
    try {
      const owner = resolveTaskOwner(request);
      const chatResponse = await handleChatRequest(request, {
          taskService,
          ownerId: owner.ownerId,
          getPupuReadiness: async (source, currentTask) => {
            const token = readPupuSessionCookie(source.headers.get("cookie"));
            const session = await sessionStore.lookup(token);
            if (!session) return "awaiting_login";
            return currentTask.context.addressBinding ? "ready" : "awaiting_address";
          },
          preparePupuScope: async (source, sessionId, task) => {
            const token = readPupuSessionCookie(source.headers.get("cookie"));
            const session = await sessionStore.lookup(token);
            if (!session) throw new Error("Pupu browser session is required");
            const selection = task.context.addressBinding;
            if (!selection) throw new Error("Pupu delivery address selection is required");
            await scopeTickets.issue({
              sessionId,
              taskId: task.taskId,
              taskVersion: task.version,
              capabilities: task.allowedCapabilities,
              accountId: session.accountId,
              accountsRoot: loginConfig.accountsRoot,
              dataRoot: loginConfig.dataRoot,
              receiverId: selection.receiverId,
              storeId: selection.storeId,
              placeId: selection.placeId,
            });
          },
          cleanupPupuScope: (sessionId) => scopeTickets.remove(sessionId),
          registerPupuPlan: async (_sessionId, runId, products, task) => {
            const token = readPupuSessionCookie(request.headers.get("cookie"));
            if (!token) return;
            const session = await sessionStore.lookup(token);
            if (!session) return;
            const storedSelection = task.context.addressBinding;
            if (!storedSelection || storedSelection.placeZip === undefined) return;
            const selection = { ...storedSelection, placeZip: storedSelection.placeZip };
            cartController.registerPlan(session.accountId, runId, selection, products);
          },
        });
      if (owner.setCookie) chatResponse.headers.set("set-cookie", owner.setCookie);
      await sendWebResponse(chatResponse, res);
    } catch {
      if (!res.headersSent) {
        res.status(502).json({
          error: {
            code: "upstream_unavailable",
            message: "实时服务暂时不可用，请稍后重试。",
          },
        });
      } else {
        res.end();
      }
    } finally {
      stopWatching();
    }
  },
);

app.get("/api/tasks/:taskId", async (req, res) => {
  const request = new Request(
    `http://${req.headers.host || "localhost"}${req.originalUrl}`,
    { headers: requestHeaders(req.headers) },
  );
  try {
    const owner = resolveTaskOwner(request);
    await sendWebResponse(
      await handleTaskRequest(request, { taskService, owner }),
      res,
    );
  } catch {
    if (!res.headersSent) {
      res.status(502).json({
        error: {
          code: "task_state_unavailable",
          message: "任务状态暂时不可用。",
        },
      });
    }
  }
});

app.use(
  "/api/pupu/login",
  express.raw({ type: () => true, limit: "128kb" }),
  async (req, res) => {
    const controller = new AbortController();
    const stopWatching = abortOnClientDisconnect(req, res, controller);
    const method = req.method.toUpperCase();
    const request = new Request(
      `http://${req.headers.host || "localhost"}${req.originalUrl}`,
      {
        method,
        headers: requestHeaders(req.headers),
        body: method === "GET" || method === "HEAD" ? undefined : req.body,
        signal: controller.signal,
      },
    );
    try {
      await sendWebResponse(
        await handlePupuLoginRequest(request, {
          sessionStore,
          controller: loginController,
          config: loginConfig,
        }),
        res,
      );
    } catch {
      if (!res.headersSent) {
        res.status(502).json({
          phase: "error",
          error: {
            code: "login_unavailable",
            message: "Pupu login is temporarily unavailable.",
            retryable: true,
          },
        });
      } else {
        res.end();
      }
    } finally {
      stopWatching();
    }
  },
);

app.use(
  "/api/pupu/addresses",
  express.raw({ type: () => true, limit: "64kb" }),
  async (req, res) => {
    const method = req.method.toUpperCase();
    const request = new Request(
      `http://${req.headers.host || "localhost"}${req.originalUrl}`,
      {
        method,
        headers: requestHeaders(req.headers),
        body: method === "GET" || method === "HEAD" ? undefined : req.body,
      },
    );
    try {
      await sendWebResponse(
        await handlePupuAddressRequest(request, {
          sessionStore,
          controller: addressController,
          taskService,
          ownerId: resolveTaskOwner(request).ownerId,
          config: loginConfig,
        }),
        res,
      );
    } catch {
      if (!res.headersSent) {
        res.status(502).json({
          error: {
            code: "address_unavailable",
            message: "暂时无法读取已保存地址，请稍后重试。",
          },
        });
      }
    }
  },
);

app.use(
  "/api/pupu",
  express.raw({ type: () => true, limit: "128kb" }),
  async (req, res) => {
    const method = req.method.toUpperCase();
    const request = new Request(
      `http://${req.headers.host || "localhost"}${req.originalUrl}`,
      {
        method,
        headers: requestHeaders(req.headers),
        body: method === "GET" || method === "HEAD" ? undefined : req.body,
      },
    );
    try {
      await sendWebResponse(
        await handlePupuCommerceRequest(request, {
          taskCoordinator, taskService, ownerId: resolveTaskOwner(request).ownerId, sessionStore, cartController, checkoutController, config: loginConfig,
        }),
        res,
      );
    } catch {
      if (!res.headersSent) {
        res.status(502).json({
          error: { code: "commerce_unavailable", message: "朴朴交易服务暂时不可用。" },
        });
      }
    }
  },
);

app.post("/api/runs/:runId/stop", async (req, res) => {
  try {
    await stopHermesRun(req.params.runId, getHermesConfig());
    res.status(202).json({ ok: true });
  } catch {
    res.status(502).json({
      error: {
        code: "stop_failed",
        message: "暂时无法中止任务。",
      },
    });
  }
});

if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static("dist"));
  app.use((_req, res) => {
    res.sendFile("index.html", { root: "dist" });
  });
}

app.listen(port, host, () => {
  console.log(`LiquidJourney listening on http://${host}:${port}`);
});
