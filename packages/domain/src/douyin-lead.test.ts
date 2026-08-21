import { describe, expect, test } from 'bun:test';

import * as domain from './index';
import * as shared from './shared';
import {
  DOUYIN_APPOINTMENT_STATUS_VALUES,
  DOUYIN_APPOINTMENT_TRANSITIONS,
  DOUYIN_LEAD_ACTION_RESULT_VALUES,
  DOUYIN_LEAD_ACTION_VALUES,
  DOUYIN_VISIT_PERIOD_VALUES,
  DouyinAppointmentStatusSchema,
  DouyinLeadActionResultSchema,
  DouyinVisitPeriodSchema,
  canTransitionDouyinAppointment,
  type DouyinAppointmentStatus,
  type DouyinLeadAction,
  type DouyinLeadActionResult,
  type DouyinVisitPeriod,
} from './douyin-lead';

describe('douyin lead contracts', () => {
  test('keeps visit periods, appointment statuses and lead actions stable', () => {
    expect(DOUYIN_VISIT_PERIOD_VALUES).toEqual([
      'morning',
      'afternoon',
      'evening',
    ]);
    expect(DOUYIN_APPOINTMENT_STATUS_VALUES).toEqual([
      'pending_confirmation',
      'confirmed',
      'completed',
      'canceled',
      'invalid',
    ]);
    expect(DOUYIN_LEAD_ACTION_VALUES).toEqual([
      'assign',
      'follow_up',
      'convert',
      'mark_invalid',
    ]);
    expect(DOUYIN_LEAD_ACTION_RESULT_VALUES).toEqual([
      'assigned',
      'followed_up',
      'converted',
      'invalid',
    ]);
  });

  test('keeps the explicit map and all twenty-five transition decisions aligned', () => {
    expect(DOUYIN_APPOINTMENT_TRANSITIONS).toEqual({
      pending_confirmation: ['confirmed', 'canceled', 'invalid'],
      confirmed: ['completed', 'canceled', 'invalid'],
      completed: [],
      canceled: [],
      invalid: [],
    });

    for (const currentStatus of DOUYIN_APPOINTMENT_STATUS_VALUES) {
      for (const nextStatus of DOUYIN_APPOINTMENT_STATUS_VALUES) {
        expect(
          canTransitionDouyinAppointment(currentStatus, nextStatus),
        ).toBe(
          DOUYIN_APPOINTMENT_TRANSITIONS[currentStatus].some(
            (allowedStatus) => allowedStatus === nextStatus,
          ),
        );
      }
    }
  });

  test('parses visit periods and statuses without normalizing invalid input', () => {
    expect(DouyinVisitPeriodSchema.parse('afternoon')).toBe('afternoon');
    expect(DouyinAppointmentStatusSchema.parse('confirmed')).toBe('confirmed');

    for (const invalidValue of [
      ' afternoon ',
      'night',
      '',
      null,
      undefined,
    ]) {
      expect(DouyinVisitPeriodSchema.safeParse(invalidValue).success).toBe(
        false,
      );
    }
    for (const invalidValue of [
      ' confirmed ',
      'new',
      '',
      null,
      undefined,
    ]) {
      expect(DouyinAppointmentStatusSchema.safeParse(invalidValue).success).toBe(
        false,
      );
    }
  });

  test('couples lead actions to strict stable result discriminants', () => {
    const validResults = [
      { action: 'assign', result: 'assigned' },
      { action: 'follow_up', result: 'followed_up' },
      { action: 'convert', result: 'converted' },
      { action: 'mark_invalid', result: 'invalid' },
    ] as const satisfies readonly DouyinLeadActionResult[];

    for (const result of validResults) {
      expect(DouyinLeadActionResultSchema.parse(result)).toEqual(result);
    }

    for (const invalidResult of [
      { action: 'assign', result: 'converted' },
      { action: 'convert', result: 'converted', customer_id: 'internal-id' },
      { action: ' follow_up ', result: 'followed_up' },
      { action: 'mark_invalid', result: 'invalid ' },
    ]) {
      expect(DouyinLeadActionResultSchema.safeParse(invalidResult).success).toBe(
        false,
      );
    }
  });

  test('exports the same runtime contracts from root and source barrel', () => {
    for (const entryPoint of [domain, shared]) {
      expect(entryPoint.DOUYIN_VISIT_PERIOD_VALUES).toBe(
        DOUYIN_VISIT_PERIOD_VALUES,
      );
      expect(entryPoint.DOUYIN_APPOINTMENT_STATUS_VALUES).toBe(
        DOUYIN_APPOINTMENT_STATUS_VALUES,
      );
      expect(entryPoint.DOUYIN_APPOINTMENT_TRANSITIONS).toBe(
        DOUYIN_APPOINTMENT_TRANSITIONS,
      );
      expect(entryPoint.DouyinLeadActionResultSchema).toBe(
        DouyinLeadActionResultSchema,
      );
      expect(entryPoint.canTransitionDouyinAppointment).toBe(
        canTransitionDouyinAppointment,
      );
    }
  });

  test('keeps invalid domain values outside compile-time contracts', () => {
    const visitPeriod: DouyinVisitPeriod = 'morning';
    const appointmentStatus: DouyinAppointmentStatus = 'confirmed';
    const action: DouyinLeadAction = 'follow_up';
    expect({ visitPeriod, appointmentStatus, action }).toEqual({
      visitPeriod: 'morning',
      appointmentStatus: 'confirmed',
      action: 'follow_up',
    });

    // @ts-expect-error unsupported visit periods must not compile
    const invalidVisitPeriod: DouyinVisitPeriod = 'night';
    // @ts-expect-error unsupported appointment statuses must not compile
    const invalidAppointmentStatus: DouyinAppointmentStatus = 'new';
    // @ts-expect-error unsupported actions must not compile
    const invalidAction: DouyinLeadAction = 'delete';
    expect([
      invalidVisitPeriod,
      invalidAppointmentStatus,
      invalidAction,
    ]).toHaveLength(3);
  });
});
