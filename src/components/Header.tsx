import React from 'react';
import { ScreenType } from '../types';

interface HeaderProps {
  currentScreen: ScreenType;
  onOpenMenu: () => void;
  onOpenCart: () => void;
  onOpenAccount: () => void;
  cartCount: number;
  onSelectScreen: (screen: ScreenType) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentScreen,
  onOpenMenu,
  onOpenCart,
  onOpenAccount,
  cartCount,
  onSelectScreen
}) => {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-[#f9f7f2]/85 backdrop-blur-xl border-b border-black/5">
      <div className="max-w-[720px] mx-auto h-16 px-4 flex justify-between items-center">
        {/* Left: Menu trigger or Brand Logo */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenMenu}
            aria-label="打开菜单"
            className="p-2 text-[#181919] hover:bg-black/5 rounded-full transition-all active:scale-95 flex items-center justify-center cursor-pointer"
          >
            <span className="material-symbols-outlined text-[24px]">menu</span>
          </button>

          <button
            onClick={() => onSelectScreen('resting')}
            className="flex items-baseline gap-2 cursor-pointer text-left group"
          >
            <span className="text-2xl font-bold font-headline text-[#181919] tracking-tight group-hover:opacity-80 transition-opacity">
              Pupu
            </span>
            <span className="text-[11px] font-mono-ui px-2 py-0.5 rounded-full bg-black/5 text-[#5e5e5e] font-medium hidden sm:inline-block">
              {currentScreen === 'resting' && '待命'}
              {currentScreen === 'processing' && '火锅筹备'}
              {currentScreen === 'plan' && '西式晚宴'}
            </span>
          </button>
        </div>

        {/* Quick View Mode Switcher pills in top bar */}
        <div className="hidden md:flex items-center gap-1 bg-black/5 p-1 rounded-full text-xs font-medium">
          <button
            onClick={() => onSelectScreen('resting')}
            className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
              currentScreen === 'resting' ? 'bg-white text-black shadow-xs font-semibold' : 'text-[#5e5e5e] hover:text-black'
            }`}
          >
            待命
          </button>
          <button
            onClick={() => onSelectScreen('processing')}
            className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
              currentScreen === 'processing' ? 'bg-white text-black shadow-xs font-semibold' : 'text-[#5e5e5e] hover:text-black'
            }`}
          >
            火锅方案
          </button>
          <button
            onClick={() => onSelectScreen('plan')}
            className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
              currentScreen === 'plan' ? 'bg-white text-black shadow-xs font-semibold' : 'text-[#5e5e5e] hover:text-black'
            }`}
          >
            西式晚宴
          </button>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1">
          {/* Cart Icon */}
          <button
            onClick={onOpenCart}
            aria-label="购物车"
            className="p-2 text-[#181919] hover:bg-black/5 rounded-full transition-all active:scale-95 relative flex items-center justify-center cursor-pointer"
          >
            <span className="material-symbols-outlined text-[24px]">shopping_bag</span>
            {cartCount > 0 && (
              <span className="absolute top-1 right-1 bg-black text-white text-[10px] font-mono-ui font-bold w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                {cartCount}
              </span>
            )}
          </button>

          {/* Account Icon */}
          <button
            onClick={onOpenAccount}
            aria-label="个人中心"
            className="p-2 text-[#181919] hover:bg-black/5 rounded-full transition-all active:scale-95 flex items-center justify-center cursor-pointer"
          >
            <span className="material-symbols-outlined text-[24px]">account_circle</span>
          </button>
        </div>
      </div>
    </header>
  );
};
