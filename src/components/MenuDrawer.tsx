import React from 'react';
import { ScreenType } from '../types';

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentScreen: ScreenType;
  onSelectScreen: (screen: ScreenType) => void;
  onOpenCart: () => void;
  onOpenPackage: () => void;
  onOpenAccount: () => void;
}

export const MenuDrawer: React.FC<MenuDrawerProps> = ({
  isOpen,
  onClose,
  currentScreen,
  onSelectScreen,
  onOpenCart,
  onOpenPackage,
  onOpenAccount
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-fade-in"
      />

      {/* Drawer Container */}
      <div className="relative w-80 max-w-[80vw] bg-[#f9f7f2] h-full shadow-2xl flex flex-col z-10 border-r border-black/10 animate-fade-in-up">
        {/* Header */}
        <div className="p-5 border-b border-black/10 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold font-headline text-[#181919]">Pupu</span>
            <span className="text-xs font-mono-ui bg-black/5 px-2 py-0.5 rounded-full text-[#5e5e5e]">
              智能管家
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="p-1 text-[#5e5e5e] hover:text-black rounded-full hover:bg-black/5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Content Navigation */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Preset Views */}
          <div>
            <p className="text-xs uppercase tracking-wider font-mono-ui text-[#747878] mb-2 px-3 font-semibold">
              场景页面
            </p>
            <div className="space-y-1">
              <button
                onClick={() => {
                  onSelectScreen('resting');
                  onClose();
                }}
                className={`w-full flex items-center justify-between p-3 rounded-xl transition-all cursor-pointer ${
                  currentScreen === 'resting' ? 'bg-[#181919] text-white' : 'hover:bg-black/5 text-[#1c1b1b]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[20px]">home</span>
                  <span className="text-sm font-medium">首页待命状态</span>
                </div>
                <span className="text-xs opacity-60">静息</span>
              </button>

              <button
                onClick={() => {
                  onSelectScreen('processing');
                  onClose();
                }}
                className={`w-full flex items-center justify-between p-3 rounded-xl transition-all cursor-pointer ${
                  currentScreen === 'processing' ? 'bg-[#181919] text-white' : 'hover:bg-black/5 text-[#1c1b1b]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[20px]">soup_kitchen</span>
                  <span className="text-sm font-medium">火锅筹备方案</span>
                </div>
                <span className="text-xs opacity-60">3人微辣</span>
              </button>

              <button
                onClick={() => {
                  onSelectScreen('plan');
                  onClose();
                }}
                className={`w-full flex items-center justify-between p-3 rounded-xl transition-all cursor-pointer ${
                  currentScreen === 'plan' ? 'bg-[#181919] text-white' : 'hover:bg-black/5 text-[#1c1b1b]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[20px]">wine_bar</span>
                  <span className="text-sm font-medium">西式晚宴方案</span>
                </div>
                <span className="text-xs opacity-60">4人优雅</span>
              </button>
            </div>
          </div>

          {/* Quick Hub Tools */}
          <div>
            <p className="text-xs uppercase tracking-wider font-mono-ui text-[#747878] mb-2 px-3 font-semibold">
              家庭服务中心
            </p>
            <div className="space-y-1">
              <button
                onClick={() => {
                  onClose();
                  onOpenCart();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-black/5 text-[#1c1b1b] transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">shopping_bag</span>
                <span className="text-sm font-medium">朴朴生鲜采购车</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenPackage();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-black/5 text-[#1c1b1b] transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">local_shipping</span>
                <span className="text-sm font-medium">快递物流追踪</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenAccount();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-black/5 text-[#1c1b1b] transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">person</span>
                <span className="text-sm font-medium">家庭成员偏好设置</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-black/10 bg-black/5">
          <p className="text-xs text-[#5e5e5e] font-mono-ui">Pupu AI Core v2.5</p>
          <p className="text-[11px] text-[#747878]">全双工家庭管家与智能供应链</p>
        </div>
      </div>
    </div>
  );
};
