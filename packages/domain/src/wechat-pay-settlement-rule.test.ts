import { describe, expect, test } from 'bun:test';
import {
  findWechatPaySettlementRule,
  getWechatPaySettlementRulesForSubject,
  normalizeWechatPayQualificationType,
} from './wechat-pay-settlement-rule';

describe('wechat pay settlement rule catalog', () => {
  test('returns official WeChat industry names for each supported subject', () => {
    expect(
      getWechatPaySettlementRulesForSubject('SUBJECT_TYPE_ENTERPRISE')[0],
    ).toMatchObject({
      id: '716',
      qualificationType: '零售',
    });
    expect(
      getWechatPaySettlementRulesForSubject('SUBJECT_TYPE_INDIVIDUAL')[0],
    ).toMatchObject({
      id: '719',
      qualificationType: '零售',
    });
  });

  test('resolves official values and legacy-compatible values by subject and id', () => {
    expect(
      findWechatPaySettlementRule(
        'SUBJECT_TYPE_ENTERPRISE',
        '716',
        '零售',
      )?.id,
    ).toBe('716');
    expect(
      findWechatPaySettlementRule(
        'SUBJECT_TYPE_INDIVIDUAL',
        '719',
        '零售批发/生活娱乐/其他',
      )?.id,
    ).toBe('719');
    expect(
      findWechatPaySettlementRule(
        'SUBJECT_TYPE_ENTERPRISE',
        '719',
        '零售',
      ),
    ).toBeUndefined();
  });

  test('normalizes legacy internal industry paths to official WeChat names', () => {
    expect(normalizeWechatPayQualificationType('零售批发/生活娱乐/其他')).toBe(
      '零售',
    );
    expect(
      normalizeWechatPayQualificationType('零售批发/生活娱乐/网上商城/其他'),
    ).toBe('零售');
    expect(normalizeWechatPayQualificationType('零售')).toBe('零售');
    expect(normalizeWechatPayQualificationType('餐饮')).toBe('餐饮');
  });
});
