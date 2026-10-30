/**
 * Façade des services d'administration : conserve l'API `AdminService` utilisée par les
 * contrôleurs tout en répartissant le code par domaine (voir ./*.admin.service.ts).
 * Les appelants ont déjà été autorisés comme ADMIN par les middlewares.
 */
import { AdminUserService } from './user.admin.service';
import { AdminMissionService } from './mission.admin.service';
import { AdminTripService } from './trip.admin.service';
import { AdminPaymentService } from './payment.admin.service';
import { AdminClaimService } from './claim.admin.service';
import { AdminAnalyticsService } from './analytics.admin.service';
import { AdminRoleService } from './role.admin.service';
import { AdminSystemService } from './system.admin.service';

export class AdminService {
  static listUsers = AdminUserService.listUsers.bind(AdminUserService);
  static getUserStatusSeries = AdminUserService.getUserStatusSeries.bind(AdminUserService);
  static listUsersForExport = AdminUserService.listUsersForExport.bind(AdminUserService);
  static updateUser = AdminUserService.updateUser.bind(AdminUserService);
  static deleteUser = AdminUserService.deleteUser.bind(AdminUserService);
  static getUserDetail = AdminUserService.getUserDetail.bind(AdminUserService);
  static createUser = AdminUserService.createUser.bind(AdminUserService);
  static listKyc = AdminUserService.listKyc.bind(AdminUserService);
  static approveKyc = AdminUserService.approveKyc.bind(AdminUserService);
  static rejectKyc = AdminUserService.rejectKyc.bind(AdminUserService);
  static listMissions = AdminMissionService.listMissions.bind(AdminMissionService);
  static getMissionStatusSeries = AdminMissionService.getMissionStatusSeries.bind(AdminMissionService);
  static listMissionsForExport = AdminMissionService.listMissionsForExport.bind(AdminMissionService);
  static updateMission = AdminMissionService.updateMission.bind(AdminMissionService);
  static assignMission = AdminMissionService.assignMission.bind(AdminMissionService);
  static confirmArrival = AdminMissionService.confirmArrival.bind(AdminMissionService);
  static listScanReviews = AdminMissionService.listScanReviews.bind(AdminMissionService);
  static releaseGp = AdminMissionService.releaseGp.bind(AdminMissionService);
  static deleteMission = AdminMissionService.deleteMission.bind(AdminMissionService);
  static getMissionDetail = AdminMissionService.getMissionDetail.bind(AdminMissionService);
  static reassignMission = AdminMissionService.reassignMission.bind(AdminMissionService);
  static listTrips = AdminTripService.listTrips.bind(AdminTripService);
  static getTripStatusSeries = AdminTripService.getTripStatusSeries.bind(AdminTripService);
  static listTripsForExport = AdminTripService.listTripsForExport.bind(AdminTripService);
  static deleteTrip = AdminTripService.deleteTrip.bind(AdminTripService);
  static getTripDetail = AdminTripService.getTripDetail.bind(AdminTripService);
  static updateTrip = AdminTripService.updateTrip.bind(AdminTripService);
  static listPayments = AdminPaymentService.listPayments.bind(AdminPaymentService);
  static refundPayment = AdminPaymentService.refundPayment.bind(AdminPaymentService);
  static listPaymentsForExport = AdminPaymentService.listPaymentsForExport.bind(AdminPaymentService);
  static listClaims = AdminClaimService.listClaims.bind(AdminClaimService);
  static updateClaim = AdminClaimService.updateClaim.bind(AdminClaimService);
  static getClaimThread = AdminClaimService.getClaimThread.bind(AdminClaimService);
  static addClaimMessage = AdminClaimService.addClaimMessage.bind(AdminClaimService);
  static compensateClaim = AdminClaimService.compensateClaim.bind(AdminClaimService);
  static listReviews = AdminClaimService.listReviews.bind(AdminClaimService);
  static deleteReview = AdminClaimService.deleteReview.bind(AdminClaimService);
  static getStats = AdminAnalyticsService.getStats.bind(AdminAnalyticsService);
  static getRecentActivity = AdminAnalyticsService.getRecentActivity.bind(AdminAnalyticsService);
  static getAnalyticsTimeseries = AdminAnalyticsService.getAnalyticsTimeseries.bind(AdminAnalyticsService);
  static getTopRoutes = AdminAnalyticsService.getTopRoutes.bind(AdminAnalyticsService);
  static getPaymentMethodBreakdown = AdminAnalyticsService.getPaymentMethodBreakdown.bind(AdminAnalyticsService);
  static getGpPerformance = AdminAnalyticsService.getGpPerformance.bind(AdminAnalyticsService);
  static listRoles = AdminRoleService.listRoles.bind(AdminRoleService);
  static createRole = AdminRoleService.createRole.bind(AdminRoleService);
  static updateRole = AdminRoleService.updateRole.bind(AdminRoleService);
  static deleteRole = AdminRoleService.deleteRole.bind(AdminRoleService);
  static setUserRole = AdminRoleService.setUserRole.bind(AdminRoleService);
  static listAudit = AdminSystemService.listAudit.bind(AdminSystemService);
  static sendBroadcast = AdminSystemService.sendBroadcast.bind(AdminSystemService);
  static readonly SETTING_DEFAULTS = AdminSystemService.SETTING_DEFAULTS;
  static getSettings = AdminSystemService.getSettings.bind(AdminSystemService);
  static updateSettings = AdminSystemService.updateSettings.bind(AdminSystemService);
  static bootstrapAdmin = AdminSystemService.bootstrapAdmin.bind(AdminSystemService);
  static resetPassword = AdminSystemService.resetPassword.bind(AdminSystemService);
}
