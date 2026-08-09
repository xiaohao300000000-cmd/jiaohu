import React, { useState } from 'react';
import { ScreenType } from '../types';

interface BottomInputBarProps {
  currentScreen: ScreenType;
  isLoading: boolean;
  onSubmitPrompt: (prompt: string) => void;
  onOpenVoice: () => void;
  onSelectPreset: (screen: ScreenType) => void;
}

export const BottomInputBar: React.FC<BottomInputBarProps> = ({
  currentScreen,
  isLoading,
  onSubmitPrompt,
  onOpenVoice,
  onSelectPreset
}) => {
  const [inputText, setInputText] = useState('');
  const [showQuickChips, setShowQuickChips] = useState(false);

  const getPlaceholder = () => {
    if (isLoading) return 'Pupu is thinking...';
    if (currentScreen === 'resting') return '有什么需要我做的？';
    if (currentScreen === 'processing') return '修改人数、口味或增加要求...';
    return '回复 Pupu...';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    onSubmitPrompt(inputText.trim());
    setInputText('');
  };

  const handleChipClick = (promptText: string, targetScreen?: ScreenType) => {
    if (targetScreen) {
      onSelectPreset(targetScreen);
    } else {
      onSubmitPrompt(promptText);
    }
    setShowQuickChips(false);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pb-safe pb-5 pt-3 bg-gradient-to-t from-[#f9f7f2] via-[#f9f7f2]/95 to-transparent backdrop-blur-md">
      <div className="max-w-[720px] mx-auto px-4">
        {/* Quick Suggestion Chips toggleable or when clicking + */}
        {showQuickChips && (
          <div className="mb-3 flex gap-2 overflow-x-auto hide-scrollbar pb-1 animate-fade-in-up">
            <button
              onClick={() => handleChipClick('今晚三个人吃火锅，微辣，200元以内。', 'processing')}
              className="shrink-0 px-3 py-1.5 rounded-full bg-white border border-black/10 text-xs text-[#1c1b1b] hover:bg-black/5 transition-all shadow-2xs font-medium cursor-pointer"
            >
              🍲 3人火锅 (≤¥200)
            </button>
            <button
              onClick={() => handleChipClick('今晚 7 点有 4 位客人，准备一份西式菜单，家里有点乱，记得提前提醒我打扫，顺便把灯光调暖一点。', 'plan')}
              className="shrink-0 px-3 py-1.5 rounded-full bg-white border border-black/10 text-xs text-[#1c1b1b] hover:bg-black/5 transition-all shadow-2xs font-medium cursor-pointer"
            >
              🍷 4位客人西式晚宴
            </button>
            <button
              onClick={() => handleChipClick('帮我看看顺丰快递什么时候到？')}
              className="shrink-0 px-3 py-1.5 rounded-full bg-white border border-black/10 text-xs text-[#1c1b1b] hover:bg-black/5 transition-all shadow-2xs font-medium cursor-pointer"
            >
              📦 顺丰快递进度
            </button>
            <button
              onClick={() => handleChipClick('把客厅灯光调到最暖的微醺模式')}
              className="shrink-0 px-3 py-1.5 rounded-full bg-white border border-black/10 text-xs text-[#1c1b1b] hover:bg-black/5 transition-all shadow-2xs font-medium cursor-pointer"
            >
              💡 调暖客厅灯光
            </button>
          </div>
        )}

        {/* Shimmer Indicator Header */}
        <div className="h-[2px] w-full bg-[#ebe7e7] rounded-t-full overflow-hidden mb-2 opacity-80">
          <div className={`h-full bg-[#181919] w-1/3 rounded-full ${isLoading ? 'animate-[shimmer_1.2s_infinite_ease-in-out]' : 'opacity-0'}`}></div>
        </div>

        {/* Input Bar Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white/90 border border-black/10 rounded-2xl shadow-[0px_4px_24px_rgba(0,0,0,0.04)] p-1.5 flex items-center gap-1 backdrop-blur-xl relative transition-all focus-within:border-black/30 focus-within:shadow-[0px_6px_30px_rgba(0,0,0,0.08)]"
        >
          {/* Plus Button */}
          <button
            type="button"
            onClick={() => setShowQuickChips(!showQuickChips)}
            aria-label="快速选项"
            className={`p-2.5 text-[#5e5e5e] hover:text-[#181919] rounded-xl transition-all cursor-pointer flex-shrink-0 ${showQuickChips ? 'bg-black/5 text-[#181919] rotate-45' : ''}`}
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
          </button>

          {/* Input text */}
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isLoading}
            placeholder={getPlaceholder()}
            className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-[15px] font-body text-[#1c1b1b] placeholder:text-[#444748]/50 px-2 py-2"
          />

          {/* Submit or Voice Mic Button */}
          {inputText.trim() ? (
            <button
              type="submit"
              disabled={isLoading}
              className="p-2.5 bg-[#181919] text-white rounded-xl hover:opacity-90 transition-all flex items-center justify-center shrink-0 cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_upward</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenVoice}
              aria-label="语音输入"
              className="p-2.5 text-[#5e5e5e] hover:text-[#181919] rounded-xl hover:bg-black/5 transition-all flex items-center justify-center shrink-0 cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-[20px]" data-weight="fill">mic</span>
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
