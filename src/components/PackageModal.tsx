import React from 'react';

interface PackageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PackageModal: React.FC<PackageModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-fade-in"
      />

      {/* Modal Dialog */}
      <div className="relative bg-[#f9f7f2] w-full max-w-md rounded-3xl p-6 shadow-2xl z-10 border border-black/10 animate-fade-in-up space-y-5">
        <div className="flex justify-between items-center border-b border-black/10 pb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-black">local_shipping</span>
            <h3 className="font-headline font-semibold text-lg text-[#181919]">顺丰速运物流追踪</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="p-1 text-[#5e5e5e] hover:text-black rounded-full hover:bg-black/5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Tracking info */}
        <div className="bg-white p-4 rounded-2xl border border-black/10 space-y-3 shadow-2xs">
          <div className="flex justify-between items-center text-xs font-mono-ui text-[#5e5e5e]">
            <span>运单号: SF14392810923</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
              派送中
            </span>
          </div>
          <p className="text-sm font-semibold text-[#1c1b1b]">
            派送员: 李师傅 (138****8899)
          </p>
          <p className="text-xs text-[#5e5e5e]">
            预估送达时间: 今天 16:30 - 17:00
          </p>
        </div>

        {/* Timeline */}
        <div className="space-y-4 pl-2 relative">
          <div className="absolute left-[11px] top-2 bottom-2 w-[1px] bg-black/10"></div>

          <div className="flex items-start gap-3 relative z-10">
            <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
              <span className="material-symbols-outlined text-[12px]">local_shipping</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#1c1b1b]">派件中 · 正在前往阳光花园社区</p>
              <p className="text-[11px] font-mono-ui text-[#747878]">今天 14:20</p>
            </div>
          </div>

          <div className="flex items-start gap-3 relative z-10 opacity-70">
            <div className="w-5 h-5 rounded-full bg-[#ebe7e7] text-[#444748] flex items-center justify-center shrink-0 mt-0.5">
              <span className="material-symbols-outlined text-[12px]">check</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#1c1b1b]">已到达阳光花园营业部，分配派件</p>
              <p className="text-[11px] font-mono-ui text-[#747878]">今天 09:15</p>
            </div>
          </div>
        </div>

        {/* Button */}
        <button
          onClick={onClose}
          className="w-full py-3 bg-[#181919] text-white rounded-2xl text-xs font-semibold hover:bg-black transition-all cursor-pointer"
        >
          我知道了
        </button>
      </div>
    </div>
  );
};
