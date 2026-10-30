import { PaginationParams } from '../types';

export class Helpers {
  /**
   * Generate a unique code with prefix
   * @param prefix - Code prefix (e.g., 'MIS', 'TRJ', 'PAY')
   * @returns Unique code
   */
  static generateCode(prefix: string): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    return `${prefix}-${year}-${random}`;
  }

  /**
   * Generate a unique tracking number
   * @returns Tracking number
   */
  static generateTrackingNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `SG${timestamp}${randomPart}`;
  }

  /**
   * Calculate pagination offset
   * @param page - Current page number
   * @param limit - Items per page
   * @returns Pagination parameters
   */
  static getPaginationParams(page: number = 1, limit: number = 10): PaginationParams {
    const validPage = Math.max(1, page);
    const validLimit = Math.min(100, Math.max(1, limit)); // Max 100 items per page
    const offset = (validPage - 1) * validLimit;

    return {
      page: validPage,
      limit: validLimit,
      offset,
    };
  }

  /**
   * Calculate total pages
   * @param total - Total items
   * @param limit - Items per page
   * @returns Total pages
   */
  static calculateTotalPages(total: number, limit: number): number {
    return Math.ceil(total / limit);
  }

  /**
   * Calculate platform commission
   * @param amount - Base amount
   * @param percentage - Commission percentage (default 10%)
   * @returns Commission amount
   */
  static calculateCommission(amount: number, percentage: number = 10): number {
    return Math.round((amount * percentage) / 100);
  }

  /**
   * Calculate insurance fee
   * @param packageValue - Declared package value
   * @param percentage - Insurance percentage (default 2%)
   * @returns Insurance fee
   */
  static calculateInsuranceFee(packageValue: number, percentage: number = 2): number {
    return Math.round((packageValue * percentage) / 100);
  }

  /**
   * Format currency (FCFA)
   * @param amount - Amount to format
   * @returns Formatted string
   */
  static formatCurrency(amount: number): string {
    return `${amount.toLocaleString('fr-FR')} FCFA`;
  }

  /**
   * Validate email format
   * @param email - Email to validate
   * @returns Is valid
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate phone number (Senegalese format)
   * @param phone - Phone number to validate
   * @returns Is valid
   */
  static isValidPhone(phone: string): boolean {
    // Senegalese phone: +221XXXXXXXXX or 77XXXXXXX (example)
    const phoneRegex = /^(\+221)?[0-9]{9}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  }

  /**
   * Sanitize filename
   * @param filename - Original filename
   * @returns Sanitized filename
   */
  static sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  }

  /**
   * Generate a random verification code
   * @param length - Code length (default 6)
   * @returns Verification code
   */
  static generateVerificationCode(length: number = 6): string {
    return Math.floor(Math.random() * Math.pow(10, length))
      .toString()
      .padStart(length, '0');
  }

  /**
   * Add days to a date
   * @param date - Base date
   * @param days - Days to add
   * @returns New date
   */
  static addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * Check if date is in the past
   * @param date - Date to check
   * @returns Is past
   */
  static isPast(date: Date): boolean {
    return date < new Date();
  }

  /**
   * Check if date is in the future
   * @param date - Date to check
   * @returns Is future
   */
  static isFuture(date: Date): boolean {
    return date > new Date();
  }

  /**
   * Mask sensitive data (e.g., phone, email)
   * @param value - Value to mask
   * @param type - Type ('email' or 'phone')
   * @returns Masked value
   */
  static maskSensitiveData(value: string, type: 'email' | 'phone'): string {
    if (type === 'email') {
      const [local, domain] = value.split('@');
      return `${local.substring(0, 3)}***@${domain}`;
    } else {
      return `***${value.substring(value.length - 4)}`;
    }
  }
}
