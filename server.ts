import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini AI Client (Server Side Only)
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY environment variable is missing.");
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

// Preset sample data matching exact screens in prompt
const PRESETS: Record<string, any> = {
  screen1: {
    title: "正在准备今晚的晚餐",
    query: "今晚三个人吃火锅，微辣，200元以内。",
    statusTag: "AI PROCESSING",
    reasoningSteps: [
      { text: "理解人数与预算", detail: "3人 · 微辣 · ≤¥200", completed: true },
      { text: "结合常用购买偏好", detail: "避开过敏源，优选常购品牌", completed: true },
      { text: "正在寻找合适商品", detail: "已为您精选3人火锅套餐组合", completed: false, loading: true }
    ],
    menu: {
      title: "今晚火锅备餐清单 (3人)",
      totalAmount: 168.5,
      items: [
        {
          id: "m1",
          name: "海底捞醇香清油火锅底料",
          spec: "微辣 / 220g",
          price: 18.5,
          image: "https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=200&auto=format&fit=crop"
        },
        {
          id: "m2",
          name: "精选雪花原切肥牛卷",
          spec: "冷鲜 / 350g",
          price: 58.0,
          image: "https://images.unsplash.com/photo-1588168333986-5078d3ae3976?w=200&auto=format&fit=crop"
        },
        {
          id: "m3",
          name: "高品质原切羊肉卷",
          spec: "冷鲜 / 300g",
          price: 49.0,
          image: "https://images.unsplash.com/photo-1544025162-d76694265947?w=200&auto=format&fit=crop"
        },
        {
          id: "m4",
          name: "鲜采有机火锅蔬菜包",
          spec: "配菜 / 600g",
          price: 25.0,
          image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=200&auto=format&fit=crop"
        },
        {
          id: "m5",
          name: "鲜榨玉米汁 (无糖)",
          spec: "饮品 / 1000ml",
          price: 18.0,
          image: "https://images.unsplash.com/photo-1622484210800-88510891fe97?w=200&auto=format&fit=crop"
        }
      ]
    },
    smartHomeControls: [
      { id: "light", label: "客厅灯光", status: "暖色微醺 (已就绪)", isOn: true },
      { id: "ventilation", label: "厨房排烟", status: "智能感应模式", isOn: true }
    ],
    reminders: [
      { id: "cleaning", title: "桌椅与餐具准备提醒", status: "已预约 18:30", time: "18:30", completed: false }
    ]
  },
  screen2: {
    title: "下午好。",
    subtitle: "家里目前没什么需要处理的。",
    ambientCards: [
      { id: "milk", type: "inventory", text: "牛奶大概还能喝 2 天。", actionText: "一键补货" },
      { id: "package", type: "delivery", text: "顺丰的包裹今天会到。", actionText: "查看详情", detail: "顺丰速运：SF143928109 (预估16:30送达)" }
    ]
  },
  screen3: {
    title: "今晚西式菜单 (4人)",
    query: "今晚 7 点有 4 位客人，准备一份西式菜单，家里有点乱，记得提前提醒我打扫，顺便把灯光调暖一点。",
    statusTag: "PLAN READY",
    reasoningHeader: "正在规划您的晚宴方案...",
    reasoningSteps: [
      { text: "生成 4 人份西式菜单及采购清单", detail: "", completed: true },
      { text: "设定 17:00 打扫卫生提醒", detail: "", completed: true },
      { text: "配置客厅灯光情景：暖色微醺", detail: "", completed: true }
    ],
    menu: {
      title: "今晚西式菜单 (4人)",
      totalAmount: 428.0,
      items: [
        {
          id: "w1",
          name: "澳洲 M5 肉眼牛排",
          spec: "冷鲜 / 约 800g",
          price: 258.0,
          image: "https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=200&auto=format&fit=crop"
        },
        {
          id: "w2",
          name: "新鲜有机芦笋",
          spec: "配菜 / 2把",
          price: 45.0,
          image: "https://images.unsplash.com/photo-1515471209610-e3f15de54f12?w=200&auto=format&fit=crop"
        },
        {
          id: "w3",
          name: "黑皮诺红葡萄酒",
          spec: "智利产区 / 750ml",
          price: 125.0,
          image: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=200&auto=format&fit=crop"
        }
      ]
    },
    smartHomeControls: [
      { id: "light", label: "客厅灯光", status: "暖色微醺 (已就绪)", isOn: true }
    ],
    reminders: [
      { id: "cleaning", title: "打扫提醒", status: "已为您预约", time: "17:00", completed: false }
    ]
  }
};

// Health Check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Get Preset Data
app.get("/api/pupu/presets/:key", (req, res) => {
  const key = req.params.key;
  if (PRESETS[key]) {
    res.json({ success: true, data: PRESETS[key] });
  } else {
    res.status(404).json({ success: false, message: "Preset not found" });
  }
});

// Pupu Agent API using Gemini
app.post("/api/pupu/agent", async (req, res) => {
  const { prompt, mode = "normal" } = req.body;

  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ success: false, message: "Prompt is required" });
    return;
  }

  // Fast pattern matching for standard prompt matches if requested
  if (prompt.includes("火锅") || prompt.includes("微辣") || prompt.includes("200元")) {
    res.json({ success: true, data: PRESETS.screen1 });
    return;
  }

  if (prompt.includes("西式") || prompt.includes("4位客人") || prompt.includes("打扫") || prompt.includes("灯光")) {
    res.json({ success: true, data: PRESETS.screen3 });
    return;
  }

  const ai = getAiClient();
  if (!ai) {
    // Fallback if no API key is configured
    res.json({
      success: true,
      data: {
        title: "已为您生成方案",
        query: prompt,
        statusTag: "AI PLAN READY",
        reasoningHeader: "正在规划您的专属方案...",
        reasoningSteps: [
          { text: "分析需求意图与场景", detail: prompt, completed: true },
          { text: "检索朴朴超市生鲜及家政服务", detail: "挑选高评价热销商品", completed: true },
          { text: "自动配置智能家居联动与定时提醒", detail: "灯光与设备已接入", completed: true }
        ],
        menu: {
          title: "智能推荐采购清单",
          totalAmount: 188.0,
          items: [
            {
              id: "gen1",
              name: "精选有机时令新鲜食材组合",
              spec: "冷鲜 / 约 1000g",
              price: 128.0,
              image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=200&auto=format&fit=crop"
            },
            {
              id: "gen2",
              name: "特调冷压果汁/饮品",
              spec: "饮品 / 750ml",
              price: 60.0,
              image: "https://images.unsplash.com/photo-1622484210800-88510891fe97?w=200&auto=format&fit=crop"
            }
          ]
        },
        smartHomeControls: [
          { id: "light", label: "环境灯光", status: "舒适柔光 (已设置)", isOn: true }
        ],
        reminders: [
          { id: "rem1", title: "事项提醒", status: "已设定时钟", time: "18:00", completed: false }
        ]
      }
    });
    return;
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `用户需求: "${prompt}"

请以"Pupu朴朴智能家庭管家"的身份，将该需求拆解为包含生鲜采购、智能家居控制和定时提醒的执行方案。
必须返回严格符合以下JSON结构的JSON响应：

{
  "title": "简短方案标题",
  "query": "${prompt}",
  "statusTag": "PLAN READY",
  "reasoningHeader": "正在规划您的方案...",
  "reasoningSteps": [
    { "text": "步骤1描述", "detail": "补充说明1", "completed": true },
    { "text": "步骤2描述", "detail": "补充说明2", "completed": true },
    { "text": "步骤3描述", "detail": "补充说明3", "completed": true }
  ],
  "menu": {
    "title": "采购/备餐清单标题",
    "totalAmount": 数字总价,
    "items": [
      {
        "id": "1",
        "name": "商品名称",
        "spec": "规格说明如 冷鲜/500g",
        "price": 单价数字,
        "image": "图片URL，使用Unsplash美食/水果/肉类图片"
      }
    ]
  },
  "smartHomeControls": [
    { "id": "light", "label": "客厅灯光", "status": "暖色微醺 (已就绪)", "isOn": true }
  ],
  "reminders": [
    { "id": "rem1", "title": "提醒名称", "status": "已为您预约", "time": "17:00", "completed": false }
  ]
}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            query: { type: Type.STRING },
            statusTag: { type: Type.STRING },
            reasoningHeader: { type: Type.STRING },
            reasoningSteps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  detail: { type: Type.STRING },
                  completed: { type: Type.BOOLEAN }
                },
                required: ["text", "completed"]
              }
            },
            menu: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                totalAmount: { type: Type.NUMBER },
                items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      name: { type: Type.STRING },
                      spec: { type: Type.STRING },
                      price: { type: Type.NUMBER },
                      image: { type: Type.STRING }
                    },
                    required: ["id", "name", "spec", "price"]
                  }
                }
              },
              required: ["title", "totalAmount", "items"]
            },
            smartHomeControls: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  label: { type: Type.STRING },
                  status: { type: Type.STRING },
                  isOn: { type: Type.BOOLEAN }
                },
                required: ["id", "label", "status", "isOn"]
              }
            },
            reminders: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  status: { type: Type.STRING },
                  time: { type: Type.STRING },
                  completed: { type: Type.BOOLEAN }
                },
                required: ["id", "title", "status"]
              }
            }
          },
          required: ["title", "query", "reasoningSteps", "menu", "smartHomeControls", "reminders"]
        }
      }
    });

    const parsedData = JSON.parse(response.text || "{}");
    res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ success: false, message: error.message || "AI processing failed" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Pupu Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
