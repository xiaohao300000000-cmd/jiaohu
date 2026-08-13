export type TaskDomain =
  | "general"
  | "commerce"
  | "delivery"
  | "home_automation"
  | "calendar";

export type TaskGoal =
  | "advice"
  | "find_products"
  | "revise_plan"
  | "prepare_cart"
  | "create_order";

export type TaskPhase =
  | "advising"
  | "awaiting_login"
  | "awaiting_address"
  | "searching_catalog"
  | "editing_plan"
  | "awaiting_cart_confirmation"
  | "writing_cart"
  | "awaiting_order_confirmation"
  | "creating_order"
  | "awaiting_payment"
  | "completed"
  | "blocked";

export type TaskCapability =
  | "commerce.catalog.search"
  | "commerce.catalog.meal-search"
  | "commerce.cart.read"
  | "commerce.cart.prepare"
  | "commerce.cart.write"
  | "commerce.checkout.preview"
  | "commerce.order.create"
  | "commerce.payment.read"
  | "delivery.quote"
  | "delivery.order.create"
  | "home.device.read"
  | "home.device.control"
  | "calendar.event.read"
  | "calendar.event.create";

export type TaskAction =
  | "answer"
  | "login_pupu"
  | "select_address"
  | "search_catalog"
  | "revise_plan"
  | "prepare_cart"
  | "confirm_cart"
  | "preview_checkout"
  | "confirm_order"
  | "open_payment"
  | "retry"
  | "start_new_task";

export interface TaskProduct {
  productId: string;
  providerProductId?: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  source: "pupu_live";
}

export interface TaskAddressBinding {
  receiverId: string;
  storeId: string;
  placeId: string;
  placeZip?: number;
}

export interface TaskConfirmation {
  id: string;
  version: number;
  expiresAt: string;
}

export interface TaskContext {
  peopleCount?: number;
  budgetCents?: number;
  dietaryRequirements: string[];
  requirements: string[];
  selectedProducts: TaskProduct[];
  addressBinding?: TaskAddressBinding;
  cartPreview?: TaskConfirmation;
  checkoutPreview?: TaskConfirmation;
}

export interface TaskSnapshot {
  taskId: string;
  version: number;
  requestText: string;
  domain: TaskDomain;
  goal: TaskGoal;
  phase: TaskPhase;
  context: TaskContext;
  requestedCapabilities: TaskCapability[];
  allowedCapabilities: TaskCapability[];
  nextActions: TaskAction[];
}
