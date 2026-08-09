export type ScreenType = 'resting' | 'processing' | 'plan';

export interface MenuItem {
  id: string;
  name: string;
  spec: string;
  price: number;
  image?: string;
  quantity?: number;
}

export interface ReasoningStep {
  text: string;
  detail?: string;
  completed: boolean;
  loading?: boolean;
}

export interface SmartHomeControl {
  id: string;
  label: string;
  status: string;
  isOn: boolean;
}

export interface ReminderItem {
  id: string;
  title: string;
  status: string;
  time?: string;
  completed: boolean;
}

export interface PlanData {
  title: string;
  query: string;
  statusTag?: string;
  reasoningHeader?: string;
  reasoningSteps: ReasoningStep[];
  menu: {
    title: string;
    totalAmount: number;
    items: MenuItem[];
  };
  smartHomeControls: SmartHomeControl[];
  reminders: ReminderItem[];
}

export interface CartItem extends MenuItem {
  cartQuantity: number;
}
