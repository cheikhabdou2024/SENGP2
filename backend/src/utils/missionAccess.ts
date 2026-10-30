/**
 * Contrôle d'accès aux missions (fonctions pures, sans accès base de données).
 *
 * - `full`  : administrateur, expéditeur propriétaire, GP assigné. Voit toute la mission.
 * - `pool`  : GP qui consulte une mission encore non assignée. Voit une vue réduite,
 *             sans coordonnées, adresses, jeton de livraison ni QR.
 * - `none`  : aucun accès.
 */
import { UserType } from '../types';

export type MissionAccess = 'full' | 'pool' | 'none';

interface Actor {
  id: string;
  user_type: string;
}

interface MissionOwnership {
  expediteur_id?: string | null;
  gp_id?: string | null;
  status?: string | null;
}

export function missionAccessLevel(user: Actor, mission: MissionOwnership): MissionAccess {
  if (user.user_type === UserType.ADMIN) return 'full';
  if (mission.expediteur_id === user.id || mission.gp_id === user.id) return 'full';
  if (user.user_type === UserType.GP && mission.status === 'pending' && !mission.gp_id) return 'pool';
  return 'none';
}

/** Champs visibles par un GP pour une mission non assignée. */
const POOL_FIELDS = [
  'id', 'mission_code', 'status', 'created_at',
  'departure_country', 'departure_city', 'arrival_country', 'arrival_city',
  'package_weight', 'package_length', 'package_width', 'package_height', 'package_description',
  'desired_departure_date', 'desired_arrival_date', 'offered_price', 'is_price_negotiable', 'is_insured',
  // alias calculés par la liste
  'weight', 'price', 'dimensions', 'departure_date',
] as const;

export function toPoolView(mission: Record<string, any>): Record<string, any> {
  const view: Record<string, any> = {};
  for (const key of POOL_FIELDS) {
    if (mission[key] !== undefined) view[key] = mission[key];
  }
  return view;
}

/** Champs qu'un expéditeur peut corriger tant que la mission n'est pas assignée. */
export const EDITABLE_MISSION_FIELDS = [
  'package_description',
  'pickup_address',
  'delivery_address',
  'recipient_name',
  'recipient_phone',
  'desired_departure_date',
  'desired_arrival_date',
] as const;

/** Ne garde que les champs modifiables ; ignore tout le reste (statut, prix, GP, paiement…). */
export function pickEditableFields(body: Record<string, any> | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of EDITABLE_MISSION_FIELDS) {
    if (body && body[key] !== undefined) out[key] = body[key];
  }
  return out;
}
