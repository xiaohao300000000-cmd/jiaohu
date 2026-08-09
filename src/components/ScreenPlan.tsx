import React, { useState } from 'react';
import { PlanData, MenuItem } from '../types';

interface ScreenPlanProps {
  planData: PlanData;
  onAddToCart: (item: MenuItem) => void;
  onAddAllToCart: (items: MenuItem[]) => void;
}

export const ScreenPlan: React.FC<ScreenPlanProps> = ({
  planData,
  onAddToCart,
  onAddAllToCart
}) => {
  const [isLightOn, setIsLightOn] = useState(true);
  const [isReminderDone, setIsReminderDone] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executed, setExecuted] = useState(false);
  const [addedItemIds, setAddedItemIds] = useState<Record<string, boolean>>({});

  const toggleLight = () => {
    setIsLightOn((prev) => !prev);
  };

  const toggleReminder = () => {
    setIsReminderDone((prev) => !prev);
  };

  const handleExecutePlan = () => {
    if (isExecuting || executed) return;
    setIsExecuting(true);
    setTimeout(() => {
      setIsExecuting(false);
      setExecuted(true);
    }, 1500);
  };

  const handleSingleAdd = (item: MenuItem) => {
    onAddToCart(item);
    setAddedItemIds((prev) => ({ ...prev, [item.id]: true }));
    setTimeout(() => {
      setAddedItemIds((prev) => ({ ...prev, [item.id]: false }));
    }, 1200);
  };

  const menuItems = planData.menu?.items || [
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
  ];

  return (
    <div className="flex-1 pt-24 pb-48 px-4 max-w-[720px] mx-auto w-full flex flex-col gap-8 animate-fade-in-up">
      {/* User Prompt Echo */}
      <section className="flex gap-3 items-start bg-white/60 p-4 rounded-2xl border border-black/5 shadow-2xs">
        <div className="w-8 h-8 rounded-full bg-[#f1edec] flex items-center justify-center shrink-0 mt-0.5">
          <span className="material-symbols-outlined text-[#444748] text-[18px]">person</span>
        </div>
        <p className="font-body text-base text-[#1c1b1b] leading-relaxed">
          "{planData.query || "今晚 7 点有 4 位客人，准备一份西式菜单，家里有点乱，记得提前提醒我打扫，顺便把灯光调暖一点。"}"
        </p>
      </section>

      {/* AI Response Container */}
      <section className="flex flex-col gap-8">
        {/* Reasoning Log */}
        <div className="flex flex-col gap-3 bg-[#fdf8f8] p-4 rounded-2xl border border-black/5">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#181919] text-[16px] animate-pulse">
              arrow_back_ios_new
            </span>
            <span className="font-mono-ui text-xs text-[#747878] uppercase tracking-wider font-semibold">
              {planData.reasoningHeader || "正在规划您的晚宴方案..."}
            </span>
          </div>
          <div className="pl-6 flex flex-col gap-2 border-l-2 border-black/10 ml-2">
            {planData.reasoningSteps?.map((step, idx) => (
              <div key={idx} className="flex items-center gap-2 text-[#444748] font-mono-ui text-xs">
                <span className="material-symbols-outlined text-[14px] text-emerald-600 font-bold">check</span>
                <span>{step.text} {step.detail && `(${step.detail})`}</span>
              </div>
            )) || (
              <>
                <div className="flex items-center gap-2 text-[#444748] font-mono-ui text-xs">
                  <span className="material-symbols-outlined text-[14px] text-emerald-600 font-bold">check</span>
                  <span>生成 4 人份西式菜单及采购清单</span>
                </div>
                <div className="flex items-center gap-2 text-[#444748] font-mono-ui text-xs">
                  <span className="material-symbols-outlined text-[14px] text-emerald-600 font-bold">check</span>
                  <span>设定 17:00 打扫卫生提醒</span>
                </div>
                <div className="flex items-center gap-2 text-[#444748] font-mono-ui text-xs">
                  <span className="material-symbols-outlined text-[14px] text-emerald-600 font-bold">check</span>
                  <span>配置客厅灯光情景：暖色微醺</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Generated Content: Menu Planning */}
        <div className="flex flex-col gap-6 bg-white/80 p-5 rounded-2xl border border-black/10 shadow-xs">
          <div className="flex justify-between items-center">
            <h3 className="font-headline font-semibold text-lg text-[#1c1b1b] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#5e5e5e]">restaurant</span>
              {planData.menu?.title || "今晚西式菜单 (4人)"}
            </h3>
            <button
              onClick={() => onAddAllToCart(menuItems)}
              className="text-xs font-medium text-[#181919] hover:bg-black/5 px-3 py-1.5 rounded-full border border-black/15 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
            >
              <span className="material-symbols-outlined text-[14px]">add_shopping_cart</span>
              一键采购全部
            </button>
          </div>

          <div className="flex flex-col gap-4 divide-y divide-black/5">
            {menuItems.map((item) => (
              <div key={item.id} className="pt-3 first:pt-0 flex justify-between items-center group">
                <div className="flex items-center gap-3">
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-12 h-12 object-cover rounded-xl border border-black/10 shrink-0"
                    />
                  )}
                  <div className="flex flex-col gap-0.5">
                    <span className="font-body text-sm font-semibold text-[#1c1b1b]">{item.name}</span>
                    <span className="font-mono-ui text-xs text-[#5e5e5e]">{item.spec}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-mono-ui text-sm font-semibold text-[#1c1b1b]">¥{item.price.toFixed(1)}</span>
                  <button
                    onClick={() => handleSingleAdd(item)}
                    aria-label="加购"
                    className="p-1.5 rounded-full bg-black/5 hover:bg-[#181919] hover:text-white transition-all text-[#181919] cursor-pointer active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {addedItemIds[item.id] ? "check" : "add"}
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-black/10 flex justify-between items-baseline mt-1">
            <span className="font-mono-ui text-xs text-[#5e5e5e]">预计采购金额</span>
            <span className="font-headline text-xl font-bold text-[#181919]">
              ¥{(planData.menu?.totalAmount || 428.0).toFixed(1)}
            </span>
          </div>
        </div>

        {/* Smart Home & Reminders List */}
        <div className="flex flex-col gap-4">
          <h4 className="font-mono-ui text-xs uppercase tracking-wider text-[#747878] font-semibold">
            设备联动与行程预约
          </h4>

          {/* Smart Home Control */}
          <div
            onClick={toggleLight}
            className={`flex justify-between items-center p-4 rounded-2xl border transition-all cursor-pointer ${
              isLightOn ? 'bg-amber-50/70 border-amber-200/80 shadow-2xs' : 'bg-white/80 border-black/10'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  isLightOn ? 'bg-amber-400 text-white shadow-xs' : 'bg-[#f1edec] text-[#5e5e5e]'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]" data-weight="fill">
                  lightbulb
                </span>
              </div>
              <div className="flex flex-col">
                <h4 className="font-body text-sm font-semibold text-[#1c1b1b]">客厅灯光</h4>
                <p className={`font-mono-ui text-xs ${isLightOn ? 'text-amber-700 font-medium' : 'text-[#747878]'}`}>
                  {isLightOn ? '暖色微醺 (已就绪)' : '已关闭'}
                </p>
              </div>
            </div>

            {/* Custom Switch Toggle */}
            <div
              className={`w-12 h-7 rounded-full p-1 flex items-center transition-colors duration-300 ${
                isLightOn ? 'bg-[#181919] justify-end' : 'bg-[#e1dfdf] justify-start'
              }`}
            >
              <div className="w-5 h-5 bg-white rounded-full shadow-xs transition-transform duration-300"></div>
            </div>
          </div>

          {/* Reminder Setup */}
          <div
            onClick={toggleReminder}
            className={`flex justify-between items-center p-4 rounded-2xl border transition-all cursor-pointer ${
              isReminderDone ? 'bg-emerald-50/70 border-emerald-200' : 'bg-white/80 border-black/10'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                isReminderDone ? 'bg-emerald-600 text-white' : 'bg-[#f1edec] text-[#5e5e5e]'
              }`}>
                <span className="material-symbols-outlined text-[20px]">
                  {isReminderDone ? 'check_circle' : 'notifications_active'}
                </span>
              </div>
              <div className="flex flex-col">
                <h4 className="font-body text-sm font-semibold text-[#1c1b1b]">打扫提醒</h4>
                <p className={`font-mono-ui text-xs ${isReminderDone ? 'text-emerald-700 font-medium' : 'text-[#5e5e5e]'}`}>
                  {isReminderDone ? '已标记打扫完毕' : '已为您预约'}
                </p>
              </div>
            </div>
            <span className="font-mono-ui text-sm text-[#5e5e5e] font-semibold">17:00</span>
          </div>
        </div>

        {/* Primary Action Button */}
        <div className="pt-2">
          <button
            onClick={handleExecutePlan}
            disabled={isExecuting}
            className={`w-full py-4 rounded-2xl font-headline font-semibold text-base transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-98 ${
              executed
                ? 'bg-emerald-700 text-white'
                : isExecuting
                ? 'bg-black/60 text-white'
                : 'bg-[#181919] hover:bg-black text-white'
            }`}
          >
            {isExecuting ? (
              <>
                <span className="material-symbols-outlined text-[20px] animate-spin">hourglass_empty</span>
                <span>正在一键下发指令与加购...</span>
              </>
            ) : executed ? (
              <>
                <span className="material-symbols-outlined text-[20px]">check_circle</span>
                <span>已确认执行 · 指令已生效</span>
              </>
            ) : (
              <>
                <span>确认执行方案</span>
                <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
};
