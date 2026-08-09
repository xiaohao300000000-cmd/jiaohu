import React, { useState, useEffect } from 'react';

interface VoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitVoiceText: (text: string) => void;
}

export const VoiceModal: React.FC<VoiceModalProps> = ({
  isOpen,
  onClose,
  onSubmitVoiceText
}) => {
  const [transcript, setTranscript] = useState('今晚 7 点有 4 位客人，准备一份西式菜单...');
  const [isListening, setIsListening] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setIsListening(true);
      const timer = setTimeout(() => {
        setTranscript('今晚 7 点有 4 位客人，准备一份西式菜单，家里有点乱，记得提前提醒我打扫，顺便把灯光调暖一点。');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onSubmitVoiceText(transcript);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity animate-fade-in"
      />

      {/* Dialog */}
      <div className="relative bg-[#181919] text-white w-full max-w-sm rounded-3xl p-6 shadow-2xl z-10 border border-white/10 animate-fade-in-up space-y-6 text-center">
        {/* Pulse Mic visualizer */}
        <div className="flex justify-center items-center py-4">
          <div className="relative flex items-center justify-center">
            <div className="absolute w-20 h-20 bg-white/10 rounded-full animate-ping"></div>
            <div className="absolute w-16 h-16 bg-white/20 rounded-full animate-pulse"></div>
            <div className="w-12 h-12 bg-white text-black rounded-full flex items-center justify-center relative z-10 shadow-lg">
              <span className="material-symbols-outlined text-[24px]" data-weight="fill">
                mic
              </span>
            </div>
          </div>
        </div>

        {/* Listening Status */}
        <div className="space-y-2">
          <p className="text-xs font-mono-ui text-white/60 uppercase tracking-widest">
            {isListening ? '正在倾听您的家庭指令...' : '识别完毕'}
          </p>
          <p className="text-base font-body text-white/90 leading-relaxed min-h-[48px] px-2">
            "{transcript}"
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-white/10 text-white hover:bg-white/20 text-xs font-semibold transition-all cursor-pointer"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-3 rounded-xl bg-white text-black hover:bg-white/90 text-xs font-semibold transition-all cursor-pointer shadow-md"
          >
            发送方案指令
          </button>
        </div>
      </div>
    </div>
  );
};
