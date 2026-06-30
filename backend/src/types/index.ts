import { Request } from 'express';

// User Types
export enum UserType {
  EXPEDITEUR = 'expediteur',
  GP = 'gp',
  ADMIN = 'admin'
}

export enum UserStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  SUSPENDED = 'suspended',
  DELETED = 'deleted'
}

export interface User {
  id: string;
  email: string;
  phone: string;
  password_hash: string;
  user_type: UserType;
  first_name: string;
  last_name: string;
  date_of_birth?: Date;
  profile_photo_url?: string;
  status: UserStatus;
  is_email_verified: boolean;
  is_phone_verified: boolean;
  identity_document_type?: string;
  identity_document_url?: string;
  identity_verified_at?: Date;
  verified_by?: string;
  country?: string;
  city?: string;
  address?: string;
  average_rating: number;
  total_reviews: number;
  created_at: Date;
  updated_at: Date;
  last_login_at?: Date;
  deleted_at?: Date;
}

// Mission Types
export enum MissionStatus {
  PENDING = 'pending',
  MATCHED = 'matched',
  ACCEPTED = 'accepted',
  PICKED_UP = 'picked_up',
  IN_TRANSIT = 'in_transit',
  IN_CUSTOMS = 'in_customs',
  OUT_FOR_DELIVERY = 'out_for_delivery',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  DISPUTED = 'disputed'
}

export interface Mission {
  id: string;
  mission_code: string;
  expediteur_id: string;
  gp_id?: string;
  trip_id?: string;
  departure_country: string;
  departure_city: string;
  pickup_address: string;
  arrival_country: string;
  arrival_city: string;
  delivery_address: string;
  package_weight: number;
  package_length?: number;
  package_width?: number;
  package_height?: number;
  package_description?: string;
  package_value?: number;
  package_photos?: string[];
  desired_departure_date: Date;
  desired_arrival_date?: Date;
  actual_pickup_date?: Date;
  actual_delivery_date?: Date;
  offered_price: number;
  final_price?: number;
  is_price_negotiable: boolean;
  status: MissionStatus;
  qr_code_url?: string;
  qr_code_data?: string;
  is_insured: boolean;
  insurance_cost?: number;
  tracking_number: string;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
}

// Trip Types
export enum TripStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export interface Trip {
  id: string;
  trip_code: string;
  gp_id: string;
  departure_country: string;
  departure_city: string;
  departure_airport_code?: string;
  arrival_country: string;
  arrival_city: string;
  arrival_airport_code?: string;
  departure_date: Date;
  arrival_date: Date;
  flight_number?: string;
  airline?: string;
  available_weight: number;
  max_packages: number;
  current_packages: number;
  status: TripStatus;
  created_at: Date;
  updated_at: Date;
}

// Payment Types
export enum PaymentMethod {
  WAVE = 'wave',
  ORANGE_MONEY = 'orange_money',
  FREE_MONEY = 'free_money',
  CARD = 'card',
  BANK_TRANSFER = 'bank_transfer'
}

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled'
}

export enum TransactionType {
  MISSION_PAYMENT = 'mission_payment',
  WITHDRAWAL = 'withdrawal',
  REFUND = 'refund',
  COMMISSION = 'commission',
  BONUS = 'bonus'
}

export interface Payment {
  id: string;
  payment_code: string;
  mission_id?: string;
  payer_id: string;
  payee_id?: string;
  amount: number;
  currency: string;
  commission: number;
  net_amount: number;
  payment_method: PaymentMethod;
  payment_provider?: string;
  external_transaction_id?: string;
  external_reference?: string;
  status: PaymentStatus;
  transaction_type: TransactionType;
  payment_details?: any;
  failure_reason?: string;
  created_at: Date;
  processed_at?: Date;
  completed_at?: Date;
}

// Claim Types
export enum ClaimType {
  DAMAGED_PACKAGE = 'damaged_package',
  LOST_PACKAGE = 'lost_package',
  DELAYED_DELIVERY = 'delayed_delivery',
  WRONG_DELIVERY = 'wrong_delivery',
  TRACKING_ISSUE = 'tracking_issue',
  PAYMENT_ISSUE = 'payment_issue',
  OTHER = 'other'
}

export enum ClaimStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  REJECTED = 'rejected',
  CLOSED = 'closed'
}

export enum ClaimPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export interface Claim {
  id: string;
  claim_code: string;
  mission_id: string;
  claimant_id: string;
  claim_type: ClaimType;
  title: string;
  description: string;
  evidence_urls?: string[];
  status: ClaimStatus;
  priority: ClaimPriority;
  assigned_to?: string;
  resolution?: string;
  compensation_amount?: number;
  created_at: Date;
  updated_at: Date;
  resolved_at?: Date;
  response_deadline?: Date;
  resolution_deadline?: Date;
}

// Notification Types
export enum NotificationType {
  MISSION_MATCHED = 'mission_matched',
  MISSION_ASSIGNED = 'mission_assigned',
  MISSION_ACCEPTED = 'mission_accepted',
  MISSION_PICKUP = 'mission_pickup',
  MISSION_TRANSIT = 'mission_transit',
  MISSION_DELIVERED = 'mission_delivered',
  PAYMENT_RECEIVED = 'payment_received',
  CLAIM_CREATED = 'claim_created',
  CLAIM_RESOLVED = 'claim_resolved',
  REVIEW_RECEIVED = 'review_received',
  ACCOUNT_VERIFIED = 'account_verified',
  SYSTEM_ALERT = 'system_alert'
}

export interface Notification {
  id: string;
  user_id: string;
  notification_type: NotificationType;
  title: string;
  message: string;
  action_url?: string;
  metadata?: any;
  is_read: boolean;
  read_at?: Date;
  sent_via_push: boolean;
  sent_via_email: boolean;
  sent_via_sms: boolean;
  created_at: Date;
  expires_at?: Date;
}

// Auth Types
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    user_type: UserType;
  };
}

export interface TokenPayload {
  sub: string;
  email: string;
  role: UserType;
  iat?: number;
  exp?: number;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  errors?: any[];
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

// Pagination Types
export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
