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

function requestHeaders(headers: express.Request["headers"]): Headers {
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
      await sendWebResponse(await handleChatRequest(request), res);
    } catch {
      if (!res.headersSent) {
        res.status(502).json({
          error: {
            code: "upstream_unavailable",
            message: "Hermes 暂时不可用，请稍后重试。",
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
            message: "朴朴登录暂时不可用。",
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
