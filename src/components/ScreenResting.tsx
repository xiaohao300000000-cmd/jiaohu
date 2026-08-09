import React from 'react';
import { ScreenType } from '../types';

interface ScreenRestingProps {
  onOpenPackageDetail: () => void;
  onSelectPreset: (screen: ScreenType) => void;
  onAddToCart: (item: { id: string; name: string; spec: string; price: number; image?: string }) => void;
}

export const ScreenResting: React.FC<ScreenRestingProps> = ({
  onOpenPackageDetail,
  onSelectPreset,
  onAddToCart
}) => {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return '上午好。';
    if (hour < 18) return '下午好。';
    return '晚上好。';
  };

  const handleReorderMilk = () => {
    onAddToCart({
      id: 'milk-1',
      name: '光明致优鲜牛奶 950ml',
      spec: "巴氏杀菌鲜奶 / 950ml",
      price: 26.8,
      image: "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=200&auto=format&fit=crop"
    });
  };

  return (
    <div className="flex-1 px-4 pt-24 pb-36 max-w-[720px] mx-auto w-full flex flex-col justify-center animate-fade-in-up">
      <div className="space-y-8 max-w-md mx-auto w-full">
        {/* Main Title & Greeting */}
        <div className="space-y-2">
          <h1 className="text-4xl md:text-5xl font-semibold font-headline text-[#1c1b1b] tracking-tight">
            {getGreeting()}
          </h1>
          <p className="text-lg text-[#444748] font-normal">
            家里目前没什么需要处理的。
          </p>
        </div>

        {/* Ambient Info Section */}
        <div className="space-y-4 pt-6 border-t border-black/10">
          {/* Item 1: Milk Notice */}
          <div className="flex items-center justify-between group py-1">
            <span className="text-base md:text-lg text-[#444748] leading-relaxed">
              牛奶大概还能喝 2 天。
            </span>
            <button
              onClick={handleReorderMilk}
              className="text-xs text-[#181919] font-medium underline underline-offset-4 hover:opacity-70 transition-opacity cursor-pointer shrink-0 ml-4"
            >
              补货 ¥26.8
            </button>
          </div>

          {/* Item 2: Package Notice */}
          <div className="flex items-center justify-between group py-1">
            <span className="text-base md:text-lg text-[#444748] leading-relaxed">
              顺丰的包裹今天会到。
            </span>
            <button
              onClick={onOpenPackageDetail}
              className="text-xs text-[#181919] font-medium underline underline-offset-4 hover:opacity-70 transition-opacity cursor-pointer shrink-0 ml-4"
            >
              查看详情
            </button>
          </div>

          {/* Additional Ambient Note */}
          <div className="flex items-center justify-between group py-1 text-xs text-[#747878] font-mono-ui pt-2 border-t border-black/5">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              室内空气良好 · 22℃ / 湿度 52%
            </span>
            <span>朴朴管家已接管</span>
          </div>
        </div>

        {/* Quick Action Entry Cards */}
        <div className="pt-8">
          <p className="text-xs uppercase tracking-wider font-mono-ui text-[#747878] mb-3">
            快速预设场景
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onSelectPreset('processing')}
              className="p-4 rounded-2xl bg-white/80 border border-black/10 text-left hover:border-black/30 hover:shadow-xs transition-all cursor-pointer group"
            >
              <div className="text-sm font-semibold text-[#181919] group-hover:translate-x-0.5 transition-transform">
                🍲 火锅筹备方案
              </div>
              <div className="text-xs text-[#5e5e5e] mt-1">
                3人 · 微辣 · ≤¥200
              </div>
            </button>

            <button
              onClick={() => onSelectPreset('plan')}
              className="p-4 rounded-2xl bg-white/80 border border-black/10 text-left hover:border-black/30 hover:shadow-xs transition-all cursor-pointer group"
            >
              <div className="text-sm font-semibold text-[#181919] group-hover:translate-x-0.5 transition-transform">
                🍷 西式晚宴方案
              </div>
              <div className="text-xs text-[#5e5e5e] mt-1">
                4人份 · 暖光 · 定时提醒
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
