import { req } from './http';

export interface OpeningRange { day: number; from: string; to: string }

export interface AgendaSettings {
  openingHours: OpeningRange[];
  slotMinutes: number;
  defaultDurationMinutes: number;
  resources: string[];
  capacity: number;
  reminderHours: number;
  timeZone: string;
  /** false until the owner saves the settings once */
  configured?: boolean;
}

export type AppointmentStatus = 'confirmed' | 'done' | 'no_show' | 'cancelled';

export interface Appointment {
  id: string;
  customerName: string;
  customerPhone: string | null;
  contactId: string | null;
  productId: string | null;
  serviceName: string | null;
  resource: string | null;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  source: 'manual' | 'whatsapp_ai';
  notes: string | null;
  reminderSentAt: string | null;
}

export interface NewAppointment {
  customerName: string;
  customerPhone?: string;
  productId?: string;
  resource?: string;
  date: string;
  time: string;
  durationMinutes?: number;
  notes?: string;
}

export const agendaApi = {
  getSettings: () => req<AgendaSettings>('/agenda/settings'),
  saveSettings: (body: Omit<AgendaSettings, 'timeZone' | 'configured'>) =>
    req<AgendaSettings>('/agenda/settings', { method: 'PUT', body: JSON.stringify(body) }),
  list: (from: string, to: string) => req<Appointment[]>(`/agenda/appointments?from=${from}&to=${to}`),
  create: (body: NewAppointment) => req<Appointment>('/agenda/appointments', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<NewAppointment> & { status?: AppointmentStatus }) =>
    req<Appointment>(`/agenda/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) => req<{ id: string }>(`/agenda/appointments/${id}`, { method: 'DELETE' }),
  availability: (date: string, productId?: string, resource?: string) => {
    const qs = new URLSearchParams({ date, ...(productId ? { productId } : {}), ...(resource ? { resource } : {}) });
    return req<string[]>(`/agenda/availability?${qs}`);
  },
};
