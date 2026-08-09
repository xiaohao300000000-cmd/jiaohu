import React, { useState } from 'react';
import { PlanData, MenuItem, ScreenType } from '../types';

interface ScreenProcessingProps {
  planData: PlanData;
  onAddToCart: (item: MenuItem) => void;
  onSelectPreset: (screen: ScreenType) => void;
}

export const ScreenProcessing: React.FC<ScreenProcessingProps> = ({
  planData,
  onAddToCart,
  onSelectPreset
}) => {
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});

  const handleAdd = (item: MenuItem) => {
    onAddToCart(item);
    setAddedIds((prev) => ({ ...prev, [item.id]: true }));
    setTimeout(() => {
      setAddedIds((prev) => ({ ...prev, [item.id]: false }));
    }, 1200);
  };

  return (
    <div className="flex-1 pt-24 pb-36 px-4 max-w-[720px] mx-auto w-full flex flex-col justify-center">
      {/* User Query Echo */}
      <div className="mb-8 text-right fade-in-up">
        <p className="inline-block bg-[#f1edec] text-[#1c1b1b] py-3 px-5 rounded-2xl rounded-tr-sm text-base font-body shadow-[0px_4px_20px_rgba(0,0,0,0.02)] border border-black/5">
          “{planData.query || '今晚三个人吃火锅，微辣，200元以内。'}”
        </p>
      </div>

      {/* AI Working State Container */}
      <div className="flex-1 flex flex-col justify-start">
        <div className="mb-8 fade-in-up">
          <h2 className="text-2xl font-semibold font-headline text-[#181919] mb-2">
            {planData.title || '正在准备今晚的晚餐'}
          </h2>
          <p className="text-xs font-mono-ui text-[#444748] flex items-center gap-2 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-[#181919] pulse-dot"></span>
            {planData.statusTag || 'AI PROCESSING'}
          </p>
        </div>

        {/* Task Progress List */}
        <div className="flex flex-col gap-6 pl-2 relative mb-10">
          {/* Vertical connecting line */}
          <div className="absolute left-[11px] top-4 bottom-8 w-[1px] bg-black/15 z-0"></div>

          {/* Step 1: Completed */}
          <div className="flex items-start gap-4 relative z-10 fade-in-up">
            <div className="w-6 h-6 rounded-full bg-[#181919] flex items-center justify-center mt-0.5 shadow-xs shrink-0">
              <span className="material-symbols-outlined text-white text-[14px]" data-weight="fill">
                check
              </span>
            </div>
            <div className="flex-1 pt-0.5">
              <p className="text-base font-semibold text-[#1c1b1b]">理解人数与预算</p>
              <p className="text-sm font-mono-ui text-[#444748] mt-1">3人 · 微辣 · ≤¥200</p>
            </div>
          </div>

          {/* Step 2: Completed */}
          <div className="flex items-start gap-4 relative z-10 fade-in-up">
            <div className="w-6 h-6 rounded-full bg-[#181919] flex items-center justify-center mt-0.5 shadow-xs shrink-0">
              <span className="material-symbols-outlined text-white text-[14px]" data-weight="fill">
                check
              </span>
            </div>
            <div className="flex-1 pt-0.5">
              <p className="text-base font-semibold text-[#1c1b1b]">结合常用购买偏好</p>
              <p className="text-sm text-[#444748] mt-1">避开过敏源，优选常购品牌</p>
            </div>
          </div>

          {/* Step 3: In Progress / Completed Product Finder */}
          <div className="flex items-start gap-4 relative z-10 fade-in-up">
            <div className="w-6 h-6 rounded-full bg-[#ebe7e7] border-2 border-[#181919] flex items-center justify-center mt-0.5 shrink-0">
              <div className="w-2 h-2 rounded-full bg-[#181919] pulse-dot"></div>
            </div>
            <div className="flex-1 pt-0.5">
              <p className="text-base text-[#181919] font-medium">正在寻找合适商品</p>

              {/* Shimmering placeholder and generated items */}
              <div className="mt-4 flex gap-3 overflow-x-auto hide-scrollbar pb-2">
                {planData.menu?.items?.map((item) => (
                  <div
                    key={item.id}
                    className="w-24 shrink-0 bg-white border border-black/10 rounded-xl p-2 flex flex-col items-center text-center shadow-2xs hover:shadow-md transition-all relative group"
                  >
                    <img
                      src={item.image || 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=200&auto=format&fit=crop'}
                      alt={item.name}
                      className="w-14 h-14 object-cover rounded-lg mb-1.5"
                    />
                    <span className="text-xs font-semibold text-[#181919] line-clamp-1 w-full">
                      {item.name}
                    </span>
                    <span className="text-[11px] font-mono-ui text-[#5e5e5e] mt-0.5">
                      ¥{item.price.toFixed(1)}
                    </span>
                    <button
                      onClick={() => handleAdd(item)}
                      className="mt-2 text-[10px] font-medium px-2 py-1 bg-[#181919] text-white rounded-md w-full hover:bg-black transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-95"
                    >
                      {addedIds[item.id] ? '已加' : '+ 采购'}
                    </button>
                  </div>
                ))}

                {/* Shimmer Placeholder */}
                <div className="w-16 h-24 rounded-xl bg-[#ebe7e7] shimmer border border-black/10 shrink-0"></div>
                <div className="w-16 h-24 rounded-xl bg-[#f7f3f2] border border-black/10 flex items-center justify-center shrink-0 text-[#747878]">
                  <span className="material-symbols-outlined text-[18px]">more_horiz</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action button to switch to western execution plan */}
        <div className="pt-4 flex flex-col gap-3">
          <button
            onClick={() => onSelectPreset('plan')}
            className="w-full py-3.5 px-4 bg-[#181919] text-white rounded-2xl font-medium hover:opacity-90 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 shadow-md"
          >
            <span>查看完整执行方案与晚宴细节</span>
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
};
