/**
 * Document auto-categorization for HOA documents.
 * Uses filename + title pattern matching to suggest a category.
 * Results are stored as `auto_category` and pre-filled in the UI
 * so board admins can confirm or override before saving.
 */

export type DocCategory =
  | 'bylaws'
  | 'budget'
  | 'financial'
  | 'receipts'
  | 'legal'
  | 'contracts'
  | 'sow'
  | 'meeting_minutes'
  | 'rules'
  | 'notices'
  | 'insurance'
  | 'forms'
  | 'general'

interface CategoryRule {
  category: DocCategory
  patterns: RegExp[]
}

const RULES: CategoryRule[] = [
  {
    category: 'bylaws',
    patterns: [
      /bylaw/,
      /by[\s-]law/,
      /cc&r/,
      /ccr/,
      /covenant/,
      /deed\s+restriction/,
      /governing\s+doc/,
      /declaration\s+of/,
    ],
  },
  {
    category: 'meeting_minutes',
    patterns: [
      /minutes/,
      /board\s+meeting/,
      /annual\s+meeting/,
      /special\s+meeting/,
      /town\s+hall/,
      /agm/,
      /agenda/,
    ],
  },
  {
    category: 'budget',
    patterns: [
      /annual\s+budget/,
      /proposed\s+budget/,
      /operating\s+budget/,
      /reserve\s+fund/,
      /reserve\s+study/,
      /fiscal\s+year/,
      /budget\s+\d{4}/,
    ],
  },
  {
    category: 'financial',
    patterns: [
      /financial\s+statement/,
      /income\s+statement/,
      /balance\s+sheet/,
      /profit\s+loss/,
      /cash\s+flow/,
      /audit\s+report/,
      /annual\s+report/,
      /ledger/,
      /accounting/,
    ],
  },
  {
    category: 'receipts',
    patterns: [
      /receipt/,
      /invoice/,
      /\binv\b/,
      /payment\s+confirmation/,
      /purchase\s+order/,
      /\bpo\b/,
      /bill\s+/,
      /vendor\s+payment/,
    ],
  },
  {
    category: 'contracts',
    patterns: [
      /contract/,
      /service\s+agreement/,
      /vendor\s+agreement/,
      /maintenance\s+agreement/,
      /management\s+agreement/,
      /professional\s+service/,
    ],
  },
  {
    category: 'sow',
    patterns: [
      /scope\s+of\s+work/,
      /\bsow\b/,
      /\brfp\b/,
      /\brfq\b/,
      /request\s+for\s+proposal/,
      /request\s+for\s+quote/,
      /\bbid\b/,
      /proposal/,
      /quote\s+/,
      /estimate\s+/,
    ],
  },
  {
    category: 'legal',
    patterns: [
      /legal\s+notice/,
      /cease\s+and\s+desist/,
      /\blawsuit\b/,
      /\blitigation\b/,
      /court\s+order/,
      /lien\s+/,
      /violation\s+notice/,
      /enforcement/,
      /attorney/,
      /\blaw\s+firm\b/,
    ],
  },
  {
    category: 'rules',
    patterns: [
      /house\s+rule/,
      /community\s+rule/,
      /pool\s+rule/,
      /parking\s+rule/,
      /pet\s+policy/,
      /noise\s+policy/,
      /conduct\s+policy/,
      /\bpolicy\b/,
      /\bregulation\b/,
      /\bguideline\b/,
    ],
  },
  {
    category: 'insurance',
    patterns: [
      /insurance\s+policy/,
      /certificate\s+of\s+insurance/,
      /\bcoi\b/,
      /liability\s+policy/,
      /coverage\s+/,
      /endorsement/,
    ],
  },
  {
    category: 'notices',
    patterns: [
      /\bnotice\b/,
      /announcement/,
      /newsletter/,
      /bulletin/,
      /memorandum/,
      /\bmemo\b/,
      /correspondence/,
      /resident\s+letter/,
    ],
  },
  {
    category: 'forms',
    patterns: [
      /\bform\b/,
      /application\s+/,
      /\bwaiver\b/,
      /\btemplate\b/,
      /move[\s-]in\s+form/,
      /move[\s-]out\s+form/,
      /alteration\s+request/,
      /maintenance\s+request/,
    ],
  },
]

/**
 * Detect the most likely HOA document category from filename + title.
 * Returns a category string; falls back to 'general' if no rules match.
 */
export function detectCategory(fileName: string, title = ''): DocCategory {
  const text = `${fileName} ${title}`.toLowerCase().replace(/[-_]/g, ' ')

  for (const rule of RULES) {
    if (rule.patterns.some(p => p.test(text))) {
      return rule.category
    }
  }
  return 'general'
}

/** All valid HOA document categories with display labels. */
export const CATEGORY_META: Record<DocCategory, { label: string; color: string }> = {
  bylaws:          { label: 'By-Laws & CC&Rs',     color: 'indigo' },
  budget:          { label: 'Budget',               color: 'green'  },
  financial:       { label: 'Financial',            color: 'emerald'},
  receipts:        { label: 'Receipts & Invoices',  color: 'lime'   },
  legal:           { label: 'Legal',                color: 'red'    },
  contracts:       { label: 'Contracts',            color: 'orange' },
  sow:             { label: 'Scope of Work',        color: 'amber'  },
  meeting_minutes: { label: 'Meeting Minutes',      color: 'blue'   },
  rules:           { label: 'Rules & Policies',     color: 'violet' },
  notices:         { label: 'Notices',              color: 'sky'    },
  insurance:       { label: 'Insurance',            color: 'cyan'   },
  forms:           { label: 'Forms',                color: 'teal'   },
  general:         { label: 'General',              color: 'slate'  },
}

export const VALID_CATEGORIES = Object.keys(CATEGORY_META) as DocCategory[]
