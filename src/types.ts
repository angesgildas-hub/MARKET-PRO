export type Unit = 'pcs' | 'kg' | 'g' | 'ml' | 'l';
export type PaymentMethod = 'cash' | 'card' | 'mobile';

export interface Product {
  id: string;
  storeId: string;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  price: number;
  costPrice: number;
  stock: number;
  unit: Unit;
  expiryDate?: string;
  lowStockThreshold?: number;
  updatedAt?: string;
}

export interface StoreSettings {
  id: string;
  name: string;
  subdomain?: string;
  logoUrl?: string;
  signatureUrl?: string;
  address: string;
  phone: string;
  licenseKey?: string;
  licenseExpiry?: any;
  licenseStatus?: 'active' | 'expired' | 'none' | 'pending';
  country?: string;
  paymentMethods?: string[];
  operatorNumber?: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  storeId: string;
  name: string;
  description?: string;
}

export interface Sale {
  id: string;
  storeId: string;
  timestamp: any; // Firestore Timestamp
  cashierId: string;
  cashierName?: string;
  totalAmount: number;
  discount: number;
  amountReceived: number;
  change: number;
  paymentMethod: PaymentMethod;
  itemsCount: number;
  clientId?: string;
  clientName?: string;
}

export interface Client {
  id: string;
  storeId: string;
  matricule?: string;
  name: string;
  phone: string;
  totalSpent: number;
  visitsCount: number;
  lastVisit?: any;
  createdAt: any;
}

export interface SaleItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  priceAtSale: number;
  total: number;
}

export interface CartItem extends SaleItem {
  product: Product;
}

export interface Expense {
  id: string;
  storeId: string;
  title: string;
  amount: number;
  category: string;
  date: any; // Firestore Timestamp or ISO string
  description?: string;
  createdBy: string;
}

export interface AuditLog {
  id: string;
  storeId: string;
  action: string;
  userId: string;
  userName: string;
  timestamp: any;
  details?: string;
}

export interface Employee {
  id: string;
  storeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  position: string;
  department: string;
  salary: number;
  hireDate: string;
  status: 'active' | 'on_leave' | 'terminated';
  idCardNumber?: string;
  photoUrl?: string;
  matricule?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  validUntil?: string;
}

export interface LeaveRequest {
  id: string;
  storeId: string;
  employeeId: string;
  employeeName: string;
  type: 'vacation' | 'sick' | 'personal' | 'other';
  startDate: string;
  endDate: string;
  status: 'pending' | 'approved' | 'rejected';
  reason?: string;
  createdAt: string;
}

export interface PayrollRecord {
  id: string;
  storeId: string;
  employeeId: string;
  employeeName: string;
  month: string; // e.g. "2026-05"
  baseSalary: number;
  bonuses: number;
  deductions: number;
  netPay: number;
  status: 'pending' | 'paid';
  paidAt?: string;
}

export type UserRole = 'admin' | 'cashier' | 'manager';

export interface ModulePermissions {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

export interface UserPermissions {
  pos: ModulePermissions;
  inventory: ModulePermissions;
  accounting: ModulePermissions;
  settings: ModulePermissions;
  reports: ModulePermissions;
  personnel: ModulePermissions;
  clients: ModulePermissions;
  sales: ModulePermissions;
  commandes: ModulePermissions;
  mobile_money: ModulePermissions;
  chat: ModulePermissions;
}

export interface UserProfile {
  uid: string;
  storeId: string;
  parentStoreId?: string;
  createdAt?: any;
  email: string;
  displayName: string;
  role: UserRole;
  permissions?: UserPermissions;
  theme?: 'light' | 'dark' | 'system';
  settingsPassword?: string;
  isActive?: boolean;
  pendingApproval?: boolean;
  country?: string;
  phone?: string;
}

export interface MobileTransaction {
  id: string;
  storeId: string;
  timestamp: any;
  cashierId: string;
  cashierName?: string;
  operator: string; // e.g. 'orange' | 'mtn' | 'wave' | 'moov'
  type: 'deposit' | 'withdrawal'; // 'deposit' = envoi, 'withdrawal' = retrait
  amount: number;
  commission: number;
  feesPaid: number;
  clientPhone: string;
  clientName?: string;
  referenceId: string;
  status: 'completed' | 'pending' | 'failed';
  notes?: string;
  countryCode?: string;
  merchantNumber?: string;
}

export interface CommandeItem {
  productId: string;
  name: string;
  quantity: number;
  priceAtSale: number;
  total: number;
}

export interface Commande {
  id: string;
  storeId: string;
  timestamp: any;
  createdBy: string;
  createdByName?: string;
  items: CommandeItem[];
  totalAmount: number;
  status: 'pending' | 'served' | 'completed' | 'cancelled';
  clientName?: string;
  clientId?: string;
  notes?: string;
  number: string;
}
