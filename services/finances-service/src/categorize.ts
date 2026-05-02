/**
 * Keyword-based category inference for HOA transactions.
 * Matched against the combined description + vendor string.
 * Rules are ordered from most-specific to least-specific.
 */

const RULES: Array<{ pattern: RegExp; category: string }> = [
  // ── Reserves (very specific phrase — before Maintenance to avoid false matches) ──
  { pattern: /\breserve\s+(fund|transfer|deposit|contribution|account)\b|\bcapital\s+reserve\b/i, category: 'Reserves' },

  // ── Dues Collection ────────────────────────────────────────────────────────────
  { pattern: /\bhoa\s+(dues|fee)\b|\bdues\s+collection\b|\bassessment\s+fee\b|\bcollection\s+fee\b|\bmonthly\s+dues\b/i, category: 'Dues Collection' },

  // ── Utilities ─────────────────────────────────────────────────────────────────
  { pattern: /\bwater\s*(bill|dept|district|service|utility|co\b)|\belectric(ity)?\b|\b(natural\s+)?gas\s*(co\b|company|bill|utility)|\bsewer\b|\btrash\s*(pickup|removal|service)?\b|\bgarbage\b|\brecycl/i, category: 'Utilities' },
  { pattern: /\bpg&?e\b|\bfpl\b|\bedison\b|\bconsolidated\s+ed\b|\butil(ity|ities)\b|\benergy\s+(company|service|bill)\b|\bsolar\s+panel/i, category: 'Utilities' },

  // ── Landscaping ───────────────────────────────────────────────────────────────
  { pattern: /\blandscap|\blawn\s*(care|service|maint)?\b|\bgarden(ing)?\b|\bmowing\b|\bgrass\b|\btree\s*(trim|service|removal|care)\b|\bshrub\b/i, category: 'Landscaping' },
  { pattern: /\birrigation\b|\bsprinkler\b|\bfertiliz\b|\bmulch\b|\bweed(ing)?\b|\bpruning\b|\bhedge\s+trim|\bgreens\s*keep\b/i, category: 'Landscaping' },

  // ── Insurance ─────────────────────────────────────────────────────────────────
  { pattern: /\binsurance\b|\bins\s+premium\b|\bpolic(y|ies)\s+(premium|payment)\b|\bcoverage\s+premium\b|\binsur\s+(co|company)\b/i, category: 'Insurance' },
  { pattern: /\ballstate\b|\bfarmers\s+insurance\b|\bliberty\s+mutual\b|\btravelers\s+insurance\b|\bnationwide\s+insurance\b|\bamica\b|\bsafeco\b/i, category: 'Insurance' },

  // ── Security ──────────────────────────────────────────────────────────────────
  { pattern: /\bsecurity\s*(patrol|service|guard|system|monitor|company)?\b|\badt\b|\bguard\s+service\b|\bsurveillance\b|\bmonitoring\s+service\b|\balarm\s*(system|service|monitor)?\b/i, category: 'Security' },

  // ── Legal ─────────────────────────────────────────────────────────────────────
  { pattern: /\battorne(y|ys)\b|\blaw\s+(firm|office|group)\b|\blegal\s+(fee|service|counsel)\b|\bcourt\s+(fee|cost|filing)\b|\blitigation\b|\bnotary\b/i, category: 'Legal' },

  // ── Management ────────────────────────────────────────────────────────────────
  { pattern: /\bmanagement\s+(fee|co|company|service)\b|\bproperty\s+mgmt\b|\bproperty\s+management\b|\bassociation\s+mgmt\b|\bfirstservice\b|\bcommunity\s+(mgmt|management)\b/i, category: 'Management' },

  // ── Amenities ─────────────────────────────────────────────────────────────────
  { pattern: /\bpool\s*(service|maintenance|cleaning|supply)?\b|\bgym\s*(membership|equipment|service)?\b|\bfitness\s*(center|equipment|service)?\b|\bclub\s*house\b|\btennis\s*(court)?\b|\bplayground\b|\brecreation\s*(center|service)?\b/i, category: 'Amenities' },

  // ── Capital Improvements ──────────────────────────────────────────────────────
  { pattern: /\bcapital\s+improve|\brenovation\b|\bremodel(ing)?\b|\bconstruction\s+(project|cost|fee)\b|\bpaving\b|\bparking\s+lot\s+(repair|resurface|seal)\b/i, category: 'Capital Improvements' },

  // ── Maintenance ───────────────────────────────────────────────────────────────
  { pattern: /\brepair\b|\bmaint(enance)?\b|\bplumb(ing|er)?\b|\bhvac\b|\bheat(ing)?\s+(repair|service|system)\b|\bcool(ing)?\s+(repair|service)\b|\bair\s*cond(itioner|itioning)?\b/i, category: 'Maintenance' },
  { pattern: /\belevator\s*(service|repair|maint)?\b|\broof(ing)?\s*(repair|replace|inspect)?\b|\bpainting\s+(service|contractor)\b|\bcleaning\s+service\b|\bjanitorial\b|\bjanitor\b/i, category: 'Maintenance' },
  { pattern: /\bpressure\s*wash\b|\bwindow\s*(clean|wash|repair)\b|\bcarpet\s*(clean|replace)?\b|\bhandyman\b|\bservice\s+call\b|\bexterminat\b|\bpest\s+control\b/i, category: 'Maintenance' },

  // ── Administrative (broad — keep near end) ────────────────────────────────────
  { pattern: /\boffice\s+supplies\b|\bpostage\b|\bprint(ing)?\s+(service|cost)?\b|\bbank\s+(fee|charge)\b|\bservice\s+charge\b|\baccounting\s+(fee|service)\b|\baudit\b/i, category: 'Administrative' },
  { pattern: /\btax\s+(prep|return|service|filing)\b|\bsoftware\s+(sub(scription)?|license)\b|\bprofessional\s+(service|fee)\b|\badministrative\s+(fee|cost)\b/i, category: 'Administrative' },
]

/**
 * Infer an HOA budget category from a transaction description + optional vendor name.
 * Returns 'Other' if no rule matches.
 */
export function inferCategory(description: string, vendor?: string | null): string {
  const text = `${description} ${vendor ?? ''}`.trim()
  for (const rule of RULES) {
    if (rule.pattern.test(text)) return rule.category
  }
  return 'Other'
}
