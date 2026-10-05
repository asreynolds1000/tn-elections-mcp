import { describe, it, expect } from 'vitest'
import { buildCeFormData } from './tncamp-client.js'

describe('buildCeFormData — expenditures', () => {
  it('asks tncamp for the filer, report and support/oppose columns', () => {
    const form = buildCeFormData('expenditures', { year: '2026', vendorName: 'Proctor' })
    for (const field of ['candidatePACNameField', 'reportNameField', 'electionYearField', 'adjustmentField', 'soField']) {
      expect(form.get(field), field).toBe('true')
    }
    expect(form.get('vendorName')).toBe('Proctor')
  })
})
