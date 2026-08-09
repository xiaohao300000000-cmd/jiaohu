import { useState, useEffect } from 'react';
import { ScreenType, PlanData, MenuItem, CartItem } from './types';
import { Header } from './components/Header';
import { BottomInputBar } from './components/BottomInputBar';
import { ScreenResting } from './components/ScreenResting';
import { ScreenProcessing } from './components/ScreenProcessing';
import { ScreenPlan } from './components/ScreenPlan';
import { MenuDrawer } from './components/MenuDrawer';
import { CartDrawer } from './components/CartDrawer';
import { PackageModal } from './components/PackageModal';
import { VoiceModal } from './components/VoiceModal';
import { AccountModal } from './components/AccountModal';

// Initial Preset Sample Data
const DEFAULT_HOTPOT_PLAN: PlanData = {
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
};

const DEFAULT_WESTERN_PLAN: PlanData = {
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
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('processing');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [planData, setPlanData] = useState<PlanData>(DEFAULT_HOTPOT_PLAN);

  // Modals & Drawers state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isPackageOpen, setIsPackageOpen] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  // Switch presets
  const handleSelectPreset = (screen: ScreenType) => {
    setCurrentScreen(screen);
    if (screen === 'processing') {
      setPlanData(DEFAULT_HOTPOT_PLAN);
    } else if (screen === 'plan') {
      setPlanData(DEFAULT_WESTERN_PLAN);
    }
  };

  // Cart operations
  const handleAddToCart = (item: MenuItem) => {
    setCartItems((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, cartQuantity: i.cartQuantity + 1 } : i
        );
      }
      return [...prev, { ...item, cartQuantity: 1 }];
    });
  };

  const handleAddAllToCart = (items: MenuItem[]) => {
    items.forEach((item) => handleAddToCart(item));
    setIsCartOpen(true);
  };

  const handleUpdateCartQuantity = (id: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.cartQuantity + delta;
            return newQty > 0 ? { ...item, cartQuantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  // Handle custom user prompt submit
  const handleSubmitPrompt = async (promptText: string) => {
    setIsLoading(true);
    setCurrentScreen('plan');

    try {
      const res = await fetch('/api/pupu/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText })
      });
      const json = await res.json();
      if (json.success && json.data) {
        setPlanData(json.data);
      } else {
        // Fallback custom plan structure
        setPlanData({
          title: "专属生活指令方案",
          query: promptText,
          statusTag: "PLAN READY",
          reasoningHeader: "正在规划您的专属方案...",
          reasoningSteps: [
            { text: "分析需求与家庭设备意图", detail: promptText, completed: true },
            { text: "搜寻朴朴超市备餐与周边服务", detail: "挑选适量高分生鲜", completed: true },
            { text: "配置设备联动与日程提醒", detail: "已自动连接灯光与定时任务", completed: true }
          ],
          menu: {
            title: "推荐采购/定制清单",
            totalAmount: 198.0,
            items: [
              {
                id: "p1",
                name: "有机新鲜食材礼盒",
                spec: "精选 / 1000g",
                price: 138.0,
                image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=200&auto=format&fit=crop"
              },
              {
                id: "p2",
                name: "佐餐鲜果饮/红酒",
                spec: "瓶装 / 750ml",
                price: 60.0,
                image: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=200&auto=format&fit=crop"
              }
            ]
          },
          smartHomeControls: [
            { id: "light", label: "客厅灯光", status: "暖色柔光 (已设置)", isOn: true }
          ],
          reminders: [
            { id: "rem1", title: "需求提醒", status: "已为您预约", time: "18:00", completed: false }
          ]
        });
      }
    } catch (err) {
      console.error("Failed to query Pupu agent:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const totalCartCount = cartItems.reduce((acc, item) => acc + item.cartQuantity, 0);

  return (
    <div className="min-h-screen flex flex-col font-sans bg-[#f9f7f2] text-[#1c1b1b] relative overflow-x-hidden selection:bg-black/10">
      {/* Top Header */}
      <Header
        currentScreen={currentScreen}
        onOpenMenu={() => setIsMenuOpen(true)}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenAccount={() => setIsAccountOpen(true)}
        cartCount={totalCartCount}
        onSelectScreen={handleSelectPreset}
      />

      {/* Main Canvas View */}
      <main className="flex-1 flex flex-col w-full">
        {currentScreen === 'resting' && (
          <ScreenResting
            onOpenPackageDetail={() => setIsPackageOpen(true)}
            onSelectPreset={handleSelectPreset}
            onAddToCart={handleAddToCart}
          />
        )}

        {currentScreen === 'processing' && (
          <ScreenProcessing
            planData={planData}
            onAddToCart={handleAddToCart}
            onSelectPreset={handleSelectPreset}
          />
        )}

        {currentScreen === 'plan' && (
          <ScreenPlan
            planData={planData}
            onAddToCart={handleAddToCart}
            onAddAllToCart={handleAddAllToCart}
          />
        )}
      </main>

      {/* Floating Bottom Agent Input Bar */}
      <BottomInputBar
        currentScreen={currentScreen}
        isLoading={isLoading}
        onSubmitPrompt={handleSubmitPrompt}
        onOpenVoice={() => setIsVoiceOpen(true)}
        onSelectPreset={handleSelectPreset}
      />

      {/* Side Navigation Drawer */}
      <MenuDrawer
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        currentScreen={currentScreen}
        onSelectScreen={handleSelectPreset}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenPackage={() => setIsPackageOpen(true)}
        onOpenAccount={() => setIsAccountOpen(true)}
      />

      {/* Shopping Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        onUpdateQuantity={handleUpdateCartQuantity}
        onClearCart={handleClearCart}
      />

      {/* SF Package Tracking Modal */}
      <PackageModal
        isOpen={isPackageOpen}
        onClose={() => setIsPackageOpen(false)}
      />

      {/* Real-time Voice Interaction Modal */}
      <VoiceModal
        isOpen={isVoiceOpen}
        onClose={() => setIsVoiceOpen(false)}
        onSubmitVoiceText={handleSubmitPrompt}
      />

      {/* User Preferences / Allergy Profile Modal */}
      <AccountModal
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
      />
    </div>
  );
}
