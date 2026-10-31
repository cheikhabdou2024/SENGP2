import pool from '../config/database';
import { NotificationType } from '../types';
import { NotificationService } from './notification.service';

/** Admin-facing alerts raised by the mission workflow, kept out of the status machine. */
export class MissionAlerts {
  /** Alert the admins that a GP accepted or declined an assigned mission. */
  static async gpResponded(mission: any, gpId: string, accepted: boolean): Promise<void> {
    const gp = await pool.query('SELECT first_name, last_name FROM users WHERE id = $1', [gpId]);
    const gpName = gp.rows[0] ? `${gp.rows[0].first_name} ${gp.rows[0].last_name}` : 'Le GP';
    await NotificationService.notifyAdmins({
      notification_type: accepted ? NotificationType.MISSION_ACCEPTED : NotificationType.SYSTEM_ALERT,
      title: accepted ? 'Mission acceptée' : 'Mission déclinée',
      message: accepted
        ? `${gpName} a accepté la mission ${mission.mission_code} (${mission.departure_city} → ${mission.arrival_city}).`
        : `${gpName} a décliné la mission ${mission.mission_code}. Elle est de nouveau à affecter.`,
      metadata: { kind: accepted ? 'mission_accepted' : 'mission_declined', mission_id: mission.id, gp_id: gpId },
    });
  }
}
