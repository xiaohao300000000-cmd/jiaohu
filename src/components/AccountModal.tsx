import React, { useState } from 'react';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({ isOpen, onClose }) => {
  const [allergies, setAllergies] = useState(['花生', '海鲜敏感受体']);
  const [memberCount, setMemberCount] = useState(3);
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-fade-in"
      />

      {/* Modal */}
      <div className="relative bg-[#f9f7f2] w-full max-w-md rounded-3xl p-6 shadow-2xl z-10 border border-black/10 animate-fade-in-up space-y-6">
        <div className="flex justify-between items-center border-b border-black/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#181919] text-white flex items-center justify-center font-bold text-lg font-headline">
              P
            </div>
            <div>
              <h3 className="font-headline font-semibold text-base text-[#181919]">家庭管家账号</h3>
              <p className="text-xs text-[#5e5e5e] font-mono-ui">xiaohao300000000@gmail.com</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="p-1 text-[#5e5e5e] hover:text-black rounded-full hover:bg-black/5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Member Settings */}
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-black/10 space-y-3">
            <label className="text-xs font-mono-ui text-[#5e5e5e] uppercase tracking-wider font-semibold block">
              默认常住成员人数
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMemberCount((c) => Math.max(1, c - 1))}
                className="w-8 h-8 rounded-full bg-[#f1edec] hover:bg-black/10 flex items-center justify-center font-bold text-sm cursor-pointer"
              >
                -
              </button>
              <span className="text-base font-bold font-mono-ui">{memberCount} 人</span>
              <button
                onClick={() => setMemberCount((c) => c + 1)}
                className="w-8 h-8 rounded-full bg-[#f1edec] hover:bg-black/10 flex items-center justify-center font-bold text-sm cursor-pointer"
              >
                +
              </button>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-black/10 space-y-2">
            <label className="text-xs font-mono-ui text-[#5e5e5e] uppercase tracking-wider font-semibold block">
              饮食避开过敏源
            </label>
            <div className="flex flex-wrap gap-2">
              {allergies.map((item, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-1"
                >
                  {item}
                  <button
                    onClick={() => setAllergies((arr) => arr.filter((_, i) => i !== idx))}
                    className="hover:text-red-900 cursor-pointer ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                onClick={() => {
                  const tag = prompt("请输入需避开的食物过敏源");
                  if (tag) setAllergies((arr) => [...arr, tag]);
                }}
                className="px-3 py-1 rounded-full border border-dashed border-black/20 text-xs text-[#5e5e5e] hover:bg-black/5 cursor-pointer"
              >
                + 添加过敏源
              </button>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-black/10 space-y-1">
            <span className="text-xs font-mono-ui text-[#5e5e5e] uppercase tracking-wider font-semibold block">
              优先合作供应链
            </span>
            <p className="text-xs text-[#1c1b1b] font-medium">
              朴朴超市 30分钟速达 · 山姆会员店 · 顺丰速运
            </p>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          className="w-full py-3.5 bg-[#181919] text-white rounded-2xl text-xs font-semibold hover:bg-black transition-all cursor-pointer shadow-md"
        >
          {saved ? '已保存偏好设置' : '保存偏好配置'}
        </button>
      </div>
    </div>
  );
};
