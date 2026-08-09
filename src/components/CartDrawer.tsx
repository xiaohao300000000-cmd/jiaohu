import React, { useState } from 'react';
import { CartItem } from '../types';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onUpdateQuantity: (id: string, delta: number) => void;
  onClearCart: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cartItems,
  onUpdateQuantity,
  onClearCart
}) => {
  const [isCheckedOut, setIsCheckedOut] = useState(false);

  if (!isOpen) return null;

  const totalAmount = cartItems.reduce((acc, item) => acc + item.price * item.cartQuantity, 0);

  const handleCheckout = () => {
    setIsCheckedOut(true);
    setTimeout(() => {
      setIsCheckedOut(false);
      onClearCart();
      onClose();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-fade-in"
      />

      {/* Drawer */}
      <div className="relative w-96 max-w-[90vw] bg-[#f9f7f2] h-full shadow-2xl flex flex-col z-10 border-l border-black/10 animate-fade-in-up">
        {/* Header */}
        <div className="p-5 border-b border-black/10 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#181919]">shopping_bag</span>
            <h3 className="font-headline font-semibold text-lg text-[#181919]">朴朴采购车</h3>
            <span className="text-xs font-mono-ui bg-black/5 px-2 py-0.5 rounded-full text-[#5e5e5e]">
              {cartItems.reduce((a, b) => a + b.cartQuantity, 0)} 件
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

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {cartItems.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center text-[#747878] space-y-3">
              <span className="material-symbols-outlined text-4xl opacity-40">shopping_cart</span>
              <p className="text-sm font-medium">购物车空空如也</p>
              <p className="text-xs">在场景推荐中一键添加商品吧</p>
            </div>
          ) : (
            cartItems.map((item) => (
              <div key={item.id} className="bg-white p-3 rounded-2xl border border-black/10 flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-3">
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-12 h-12 object-cover rounded-xl border border-black/10 shrink-0"
                    />
                  )}
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-[#1c1b1b] line-clamp-1">{item.name}</span>
                    <span className="text-[11px] font-mono-ui text-[#5e5e5e]">{item.spec}</span>
                    <span className="text-xs font-mono-ui font-semibold text-[#181919] mt-0.5">
                      ¥{(item.price * item.cartQuantity).toFixed(1)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-[#f1edec] p-1 rounded-lg">
                  <button
                    onClick={() => onUpdateQuantity(item.id, -1)}
                    className="w-6 h-6 flex items-center justify-center text-xs font-bold hover:bg-white rounded cursor-pointer"
                  >
                    -
                  </button>
                  <span className="text-xs font-mono-ui font-semibold px-1">{item.cartQuantity}</span>
                  <button
                    onClick={() => onUpdateQuantity(item.id, 1)}
                    className="w-6 h-6 flex items-center justify-center text-xs font-bold hover:bg-white rounded cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Checkout */}
        {cartItems.length > 0 && (
          <div className="p-5 border-t border-black/10 bg-white space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-mono-ui text-[#5e5e5e]">商品合计 (不含运费)</span>
              <span className="text-2xl font-bold font-headline text-[#181919]">
                ¥{totalAmount.toFixed(1)}
              </span>
            </div>

            <button
              onClick={handleCheckout}
              disabled={isCheckedOut}
              className={`w-full py-3.5 rounded-2xl font-semibold text-sm text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-98 ${
                isCheckedOut ? 'bg-emerald-600' : 'bg-[#181919] hover:bg-black'
              }`}
            >
              {isCheckedOut ? (
                <>
                  <span className="material-symbols-outlined text-[18px]">check</span>
                  <span>下单成功！配送员接单中 (预计25分钟)</span>
                </>
              ) : (
                <>
                  <span>一键下单配送 (朴朴快送)</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
