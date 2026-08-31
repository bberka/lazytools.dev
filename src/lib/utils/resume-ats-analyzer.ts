export type ResumeLanguage = 'en' | 'tr' | 'de';
export type LanguageSelection = ResumeLanguage | 'auto';
export type LanguageSource = 'auto' | 'manual';

export type ResumeAnalysisOptions = {
  resumeLanguage?: LanguageSelection;
  jobDescriptionLanguage?: LanguageSelection;
};

type SectionLabel =
  | 'Summary'
  | 'Experience'
  | 'Education'
  | 'Skills'
  | 'Projects'
  | 'Certifications';

type ReadabilityFormula = 'Flesch Reading Ease' | 'Amstad' | 'Ateşman';

type LanguageProfile = {
  code: ResumeLanguage;
  locale: string;
  stopWords: ReadonlySet<string>;
  sections: Record<SectionLabel, readonly string[]>;
  sectionLabels: Record<SectionLabel, string>;
  actionVerbs: readonly string[];
  actionVerbExamples: string;
  formula: ReadabilityFormula;
  keywordSuffixes: readonly string[];
  suggestions: {
    contact: string;
    summary: string;
    skills: string;
    bullets: string;
    actionVerbs: string;
    pages: string;
    keywords: string;
    detail: string;
    extraction: string;
  };
};

export type ResumeAnalysis = {
  pageCount: number;
  text: string;
  wordCount: number;
  sentenceCount: number;
  bulletCount: number;
  estimatedReadingMinutes: number;
  language: ResumeLanguage;
  requestedLanguage: LanguageSelection;
  languageSource: LanguageSource;
  languageConfidence: number;
  jobDescriptionLanguage?: ResumeLanguage;
  scores: {
    overall: number;
    contact: number;
    sections: number;
    readability: number;
    ats: number;
    keywordMatch: number;
  };
  readability: {
    formula: ReadabilityFormula;
    score: number;
    // Kept as a compatibility alias for existing consumers of this utility.
    fleschReadingEase: number;
    averageSentenceLength: number;
    averageWordLength: number;
    averageSyllablesPerWord: number;
  };
  contactChecks: {
    email: boolean;
    phone: boolean;
    linkedin: boolean;
    website: boolean;
    location: boolean;
  };
  sectionsFound: SectionLabel[];
  missingSections: SectionLabel[];
  localizedSectionsFound: string[];
  localizedMissingSections: string[];
  topResumeKeywords: string[];
  jobKeywords: string[];
  matchedKeywords: string[];
  missingJobKeywords: string[];
  actionVerbCount: number;
  suggestions: string[];
};

export const RESUME_LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'en', label: 'English' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'de', label: 'Deutsch' },
] as const satisfies ReadonlyArray<{ value: LanguageSelection; label: string }>;

const SECTION_LABELS: readonly SectionLabel[] = [
  'Summary',
  'Experience',
  'Education',
  'Skills',
  'Projects',
  'Certifications',
];

const TR_KEYWORD_SUFFIXES = [
  'larımızdan',
  'lerimizden',
  'larınızdan',
  'lerinizden',
  'larımızın',
  'lerimizin',
  'larınızın',
  'lerinizin',
  'larımız',
  'lerimiz',
  'larınız',
  'leriniz',
  'larımızı',
  'lerimizi',
  'larınızı',
  'lerinizi',
  'lardan',
  'lerden',
  'ların',
  'lerin',
  'ları',
  'leri',
  'lar',
  'ler',
  'imiz',
  'ımız',
  'umuz',
  'ümüz',
  'siniz',
  'sınız',
  'sunuz',
  'sünüz',
  'yorsunuz',
  'iyorsunuz',
  'ıyorsunuz',
  'uyorsunuz',
  'üyorsunuz',
  'iyorum',
  'ıyorum',
  'uyorum',
  'üyorum',
  'iyorsun',
  'ıyorsun',
  'uyorsun',
  'üyorsun',
  'yorum',
  'iyor',
  'ıyor',
  'uyor',
  'üyor',
  'dim',
  'dım',
  'dum',
  'düm',
  'tim',
  'tım',
  'tum',
  'tüm',
  'din',
  'dın',
  'dun',
  'dün',
  'tin',
  'tın',
  'tun',
  'tün',
  'dir',
  'dır',
  'dur',
  'dür',
  'tir',
  'tır',
  'tur',
  'tür',
  'dan',
  'den',
  'tan',
  'ten',
  'de',
  'da',
  'te',
  'ta',
  'lik',
  'lık',
  'luk',
  'lük',
  'ci',
  'cı',
  'cu',
  'cü',
  'li',
  'lı',
  'lu',
  'lü',
  'me',
  'ma',
  'yi',
  'yı',
  'yu',
  'yü',
  'in',
  'ın',
  'un',
  'ün',
  'i',
  'ı',
  'u',
  'ü',
  'e',
  'a',
] as const;

const DE_KEYWORD_SUFFIXES = ['ern', 'en', 'em', 'er', 'es', 'e', 'n', 's'] as const;

const ENGLISH_SECTION_LABELS: Record<SectionLabel, string> = {
  Summary: 'Summary',
  Experience: 'Experience',
  Education: 'Education',
  Skills: 'Skills',
  Projects: 'Projects',
  Certifications: 'Certifications',
};

const EN_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'have',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'to',
  'was',
  'were',
  'with',
  'will',
  'this',
  'your',
  'you',
  'our',
  'their',
  'them',
  'about',
  'into',
  'using',
  'used',
  'over',
  'than',
  'then',
  'also',
  'can',
  'may',
  'not',
  'but',
  'per',
  'via',
  'across',
  'such',
  'including',
  'within',
  'after',
  'before',
  'under',
  'more',
  'most',
  'less',
  'least',
  'very',
  'role',
  'work',
  'team',
  'teams',
  'experience',
  'years',
  'year',
  'responsible',
  'resume',
  'cv',
  'candidate',
]);

const TR_STOP_WORDS = new Set([
  'acaba',
  'ama',
  'ancak',
  'artık',
  'asla',
  'aslında',
  'bu',
  'buna',
  'bunu',
  'da',
  'daha',
  'de',
  'degil',
  'değil',
  'diye',
  'en',
  'gibi',
  'ile',
  'için',
  'ise',
  'mi',
  'mı',
  'mu',
  'mü',
  'nasıl',
  'ne',
  'neden',
  'olan',
  'olarak',
  'oldu',
  'olduğu',
  've',
  'veya',
  'ya',
  'yani',
  'bir',
  'birçok',
  'çok',
  'her',
  'hem',
  'kadar',
  'sonra',
  'önce',
  'üzerinde',
  'özgeçmiş',
  'aday',
  'deneyim',
  'yıl',
  'yıllık',
]);

const DE_STOP_WORDS = new Set([
  'aber',
  'als',
  'am',
  'an',
  'auch',
  'auf',
  'aus',
  'bei',
  'bis',
  'dass',
  'das',
  'dem',
  'den',
  'der',
  'des',
  'die',
  'ein',
  'eine',
  'einer',
  'eines',
  'für',
  'hat',
  'haben',
  'im',
  'in',
  'ist',
  'mit',
  'nach',
  'nicht',
  'oder',
  'sind',
  'über',
  'um',
  'und',
  'von',
  'vor',
  'war',
  'werden',
  'wie',
  'zu',
  'zum',
  'zur',
  'lebenslauf',
  'bewerber',
  'erfahrung',
  'jahre',
]);

const LANGUAGE_PROFILES: Record<ResumeLanguage, LanguageProfile> = {
  en: {
    code: 'en',
    locale: 'en-US',
    stopWords: EN_STOP_WORDS,
    sections: {
      Summary: ['summary', 'professional summary', 'profile', 'about me'],
      Experience: ['experience', 'work history', 'employment', 'professional experience'],
      Education: ['education', 'academic background', 'qualifications'],
      Skills: ['skills', 'technical skills', 'core competencies', 'toolkit'],
      Projects: ['projects', 'selected projects', 'project experience'],
      Certifications: ['certifications', 'licenses', 'certificates'],
    },
    sectionLabels: ENGLISH_SECTION_LABELS,
    actionVerbs: [
      'accelerated',
      'achieved',
      'analyzed',
      'built',
      'collaborated',
      'created',
      'delivered',
      'designed',
      'developed',
      'drove',
      'enhanced',
      'executed',
      'generated',
      'improved',
      'implemented',
      'increased',
      'launched',
      'led',
      'managed',
      'optimized',
      'owned',
      'planned',
      'reduced',
      'resolved',
      'scaled',
      'shipped',
      'streamlined',
      'supported',
    ],
    actionVerbExamples: 'built, led, improved, or delivered',
    formula: 'Flesch Reading Ease',
    keywordSuffixes: [],
    suggestions: {
      contact: 'Add a clearly extractable email address and phone number near the top.',
      summary: 'Add a short summary section to help recruiters understand your fit quickly.',
      skills: 'Add a dedicated skills section so ATS systems can match role keywords faster.',
      bullets: 'Use more bullet points for achievements instead of dense paragraphs.',
      actionVerbs: 'Start more bullets with action verbs such as {examples}.',
      pages: 'Consider trimming the resume to two pages or fewer for stronger ATS readability.',
      keywords:
        'Mirror more job-description keywords naturally in your summary, skills, and experience bullets.',
      detail:
        'Add more measurable project or impact detail; the extracted text is currently quite short.',
      extraction:
        'This PDF may be image-based or lightly extractable; verify the text layer is selectable.',
    },
  },
  tr: {
    code: 'tr',
    locale: 'tr-TR',
    stopWords: TR_STOP_WORDS,
    sections: {
      Summary: ['özet', 'profesyonel özet', 'profil', 'hakkımda', 'kariyer özeti'],
      Experience: ['deneyim', 'iş deneyimi', 'mesleki deneyim', 'çalışma geçmişi'],
      Education: ['eğitim', 'öğrenim', 'akademik geçmiş', 'öğrenim bilgileri'],
      Skills: ['beceriler', 'yetenekler', 'teknik beceriler', 'temel yetkinlikler', 'yetkinlikler'],
      Projects: ['projeler', 'seçilmiş projeler', 'proje deneyimi'],
      Certifications: ['sertifikalar', 'sertifikalar ve lisanslar', 'lisanslar', 'belgeler'],
    },
    sectionLabels: {
      ...ENGLISH_SECTION_LABELS,
      Summary: 'Özet',
      Experience: 'Deneyim',
      Education: 'Eğitim',
      Skills: 'Beceriler',
      Projects: 'Projeler',
      Certifications: 'Sertifikalar',
    },
    actionVerbs: [
      'hızlandırdım',
      'başardım',
      'analiz ettim',
      'oluşturdum',
      'geliştirdim',
      'teslim ettim',
      'tasarladım',
      'uyguladım',
      'artırdım',
      'iyileştirdim',
      'uygulamaya aldım',
      'başlattım',
      'yönettim',
      'planladım',
      'azalttım',
      'çözdüm',
      'ölçeklendirdim',
      'düzenledim',
      'destekledim',
      'iş birliği yaptım',
    ],
    actionVerbExamples: 'geliştirdim, yönettim, iyileştirdim veya uyguladım',
    formula: 'Ateşman',
    keywordSuffixes: TR_KEYWORD_SUFFIXES,
    suggestions: {
      contact:
        'E-posta adresini ve telefon numarasını üst kısımda ATS’nin kolayca okuyabileceği şekilde belirtin.',
      summary: 'Kısa bir özet bölümü ekleyerek işe uygunluğunuzu hızlıca anlatın.',
      skills:
        'ATS sistemlerinin rol anahtar kelimelerini daha hızlı eşleştirebilmesi için ayrı bir beceriler bölümü ekleyin.',
      bullets: 'Yoğun paragraflar yerine başarılarınızı daha fazla madde işaretiyle anlatın.',
      actionVerbs: 'Daha fazla maddeyi {examples} gibi eylem fiilleriyle başlatın.',
      pages:
        'ATS okunabilirliğini güçlendirmek için özgeçmişi iki sayfa veya daha kısa tutmayı düşünün.',
      keywords:
        'İş ilanındaki daha fazla anahtar kelimeyi özet, beceriler ve deneyim maddelerine doğal biçimde taşıyın.',
      detail:
        'Daha fazla ölçülebilir proje veya etki ayrıntısı ekleyin; çıkarılan metin şu anda oldukça kısa.',
      extraction:
        'Bu PDF görüntü tabanlı veya sınırlı metin çıkarılabilir olabilir; metin katmanının seçilebilir olduğunu doğrulayın.',
    },
  },
  de: {
    code: 'de',
    locale: 'de-DE',
    stopWords: DE_STOP_WORDS,
    sections: {
      Summary: ['zusammenfassung', 'profil', 'über mich', 'kurzprofil'],
      Experience: ['berufserfahrung', 'beruflicher werdegang', 'arbeitserfahrung', 'beschäftigung'],
      Education: ['ausbildung', 'studium', 'bildung', 'akademischer hintergrund'],
      Skills: [
        'kenntnisse',
        'fähigkeiten',
        'fachkenntnisse',
        'kompetenzen',
        'technische kenntnisse',
      ],
      Projects: ['projekte', 'ausgewählte projekte', 'projekterfahrung'],
      Certifications: ['zertifikate', 'zertifizierungen', 'weiterbildungen', 'lizenzen'],
    },
    sectionLabels: {
      ...ENGLISH_SECTION_LABELS,
      Summary: 'Zusammenfassung',
      Experience: 'Berufserfahrung',
      Education: 'Ausbildung',
      Skills: 'Fähigkeiten',
      Projects: 'Projekte',
      Certifications: 'Zertifikate',
    },
    actionVerbs: [
      'beschleunigt',
      'erreicht',
      'analysiert',
      'aufgebaut',
      'mitgearbeitet',
      'erstellt',
      'geliefert',
      'entworfen',
      'entwickelt',
      'vorangetrieben',
      'verbessert',
      'umgesetzt',
      'erhöht',
      'gestartet',
      'geleitet',
      'verwaltet',
      'optimiert',
      'besessen',
      'geplant',
      'reduziert',
      'gelöst',
      'skaliert',
      'versendet',
      'unterstützt',
    ],
    actionVerbExamples: 'entwickelt, geleitet, verbessert oder umgesetzt',
    formula: 'Amstad',
    keywordSuffixes: DE_KEYWORD_SUFFIXES,
    suggestions: {
      contact: 'Fügen Sie oben eine eindeutig auslesbare E-Mail-Adresse und Telefonnummer hinzu.',
      summary:
        'Fügen Sie einen kurzen Abschnitt „Zusammenfassung“ hinzu, damit Recruiter Ihre Eignung schneller verstehen.',
      skills:
        'Fügen Sie einen eigenen Abschnitt „Fähigkeiten“ hinzu, damit ATS-Systeme relevante Begriffe schneller abgleichen können.',
      bullets: 'Verwenden Sie für Erfolge mehr Aufzählungspunkte statt dichter Absätze.',
      actionVerbs: 'Beginnen Sie weitere Aufzählungen mit Aktionsverben wie {examples}.',
      pages:
        'Kürzen Sie den Lebenslauf möglichst auf zwei Seiten, um die ATS-Lesbarkeit zu verbessern.',
      keywords:
        'Übernehmen Sie weitere Begriffe aus der Stellenbeschreibung natürlich in Zusammenfassung, Fähigkeiten und Erfahrungsaufzählungen.',
      detail:
        'Ergänzen Sie mehr messbare Projekt- oder Wirkungsdetails; der extrahierte Text ist derzeit sehr kurz.',
      extraction:
        'Dieses PDF ist möglicherweise bildbasiert oder nur eingeschränkt auslesbar; prüfen Sie, ob die Textebene auswählbar ist.',
    },
  },
};

const TECHNICAL_TOKEN_PATTERN =
  /(?:\.[A-Za-z][A-Za-z0-9-]*|[A-Za-z](?:\+\+|#)|[A-Za-z][A-Za-z0-9]*(?:[./][A-Za-z0-9+#-]+)+)/g;

const COMPOUND_TOKEN_PATTERN = /[\p{L}\p{N}]+(?:[-‐‑‒–—][\p{L}\p{N}]+)+/gu;

const LOCATION_PATTERN =
  /(?:^|[^\p{L}])(?:\p{Lu}[\p{Ll}\p{M}]{1,})(?:\s+\p{Lu}[\p{Ll}\p{M}]{1,})?,\s*(?:\p{Lu}{2,}|\p{Lu}[\p{Ll}\p{M}]{1,})(?:$|[^\p{L}])/mu;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(text: string) {
  return text.normalize('NFKC').replace(/\r\n?/g, '\n').trim();
}

function normalizeToken(token: string, locale: string) {
  return token.normalize('NFKC').toLocaleLowerCase(locale).replace(/[‘’]/g, "'").trim();
}

function getWords(text: string, locale: string) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(locale, { granularity: 'word' });
    return Array.from(segmenter.segment(text))
      .filter((segment) => segment.isWordLike)
      .map((segment) => segment.segment);
  }

  return text.match(/[\p{L}\p{N}]+(?:['’+./#-][\p{L}\p{N}]+)*/gu) ?? [];
}

function getSentences(text: string, locale: string) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' });
    return Array.from(segmenter.segment(text))
      .map((segment) => segment.segment.trim())
      .filter(Boolean);
  }

  return text.match(/[^\s].*?[.!?]+(?=\s|$)|[^\s].+$/gm) ?? [];
}

function getKeywordCandidates(text: string, profile: LanguageProfile) {
  const words = getWords(text, profile.locale);
  const wordKeys = new Set(words.map((word) => normalizeToken(word, profile.locale)));
  const supplementalTokens = [
    ...(text.match(TECHNICAL_TOKEN_PATTERN) ?? []),
    ...(text.match(COMPOUND_TOKEN_PATTERN) ?? []),
  ];
  const supplementalKeys = new Set<string>();

  return [
    ...words,
    ...supplementalTokens.filter((token) => {
      const key = normalizeToken(token, profile.locale);
      if (wordKeys.has(key) || supplementalKeys.has(key)) return false;
      supplementalKeys.add(key);
      return true;
    }),
  ];
}

function isTechnicalToken(token: string) {
  return /^(?:\.[a-z][a-z0-9-]*|[a-z](?:\+\+|#)|[a-z][a-z0-9]*(?:[./][a-z0-9+#-]+)+)$/i.test(token);
}

function getKeywordTokens(text: string, profile: LanguageProfile) {
  return getKeywordCandidates(text, profile)
    .map((word) => normalizeToken(word, profile.locale))
    .filter((word) => {
      const lettersAndNumbers = word.replace(/[^\p{L}\p{N}]/gu, '');
      return (
        (lettersAndNumbers.length >= 3 || isTechnicalToken(word)) && !profile.stopWords.has(word)
      );
    });
}

function stripMarks(value: string) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '');
}

function getLocaleCompatibilityKey(normalized: string, locale: string) {
  return locale.startsWith('de')
    ? normalized.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    : normalized
        .replace(/ç/g, 'c')
        .replace(/ğ/g, 'g')
        .replace(/ı/g, 'i')
        .replace(/İ/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ş/g, 's')
        .replace(/ü/g, 'u');
}

function getKeywordStemKeys(normalized: string, profile: LanguageProfile) {
  const locale = profile.locale;
  if (isTechnicalToken(normalized)) return new Set<string>();

  const compact = normalized.replace(/[^\p{L}\p{N}]/gu, '');
  const suffixes = profile.keywordSuffixes;
  const minimumStemLength = locale.startsWith('tr') ? 4 : 5;
  const keys = new Set<string>();

  if (compact.length < minimumStemLength + 2 || suffixes.length === 0) return keys;

  suffixes.forEach((suffix) => {
    if (!compact.endsWith(suffix)) return;

    const stem = compact.slice(0, -suffix.length);
    if (stem.length < minimumStemLength) return;

    keys.add(stem);
    keys.add(stripMarks(stem));
    keys.add(getLocaleCompatibilityKey(stem, locale));
  });

  return keys;
}

function getComparisonKeys(token: string, profile: LanguageProfile) {
  const locale = profile.locale;
  const normalized = normalizeToken(token, locale);
  const stripped = stripMarks(normalized);
  const compatibility = getLocaleCompatibilityKey(normalized, locale);
  const keys = new Set([normalized, stripped, compatibility]);
  const compact = normalized.replace(/[^\p{L}\p{N}]/gu, '');

  if (compact && compact !== normalized) {
    keys.add(compact);
    keys.add(stripMarks(compact));
    keys.add(getLocaleCompatibilityKey(compact, locale));
  }

  getKeywordStemKeys(normalized, profile).forEach((key) => keys.add(key));
  return keys;
}

function buildComparisonKeySet(tokens: string[], profile: LanguageProfile) {
  const keys = new Set<string>();
  tokens.forEach((token) => {
    getComparisonKeys(token, profile).forEach((key) => keys.add(key));
  });
  return keys;
}

function extractKeywords(text: string, profile: LanguageProfile, maxKeywords: number) {
  const words = getKeywordTokens(text, profile);
  const counts = new Map<string, number>();

  words.forEach((word) => {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  });

  return [...counts.entries()]
    .sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], profile.locale, { sensitivity: 'base' })
    )
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

function normalizePhrase(value: string, profile: LanguageProfile) {
  return getWords(value, profile.locale)
    .map((word) => normalizeToken(word, profile.locale))
    .join(' ');
}

function detectSections(text: string, profile: LanguageProfile) {
  const normalizedLines = text
    .split('\n')
    .map((line) => normalizePhrase(line.trim(), profile))
    .filter(Boolean);

  return SECTION_LABELS.filter((label) => {
    const aliases = profile.sections[label].map((alias) => normalizePhrase(alias, profile));
    return aliases.some((alias) => normalizedLines.includes(alias));
  });
}

function countTermOccurrences(text: string, terms: readonly string[], profile: LanguageProfile) {
  const tokens = getWords(text, profile.locale).map((word) => normalizeToken(word, profile.locale));
  let count = 0;

  terms.forEach((term) => {
    const termTokens = getWords(term, profile.locale).map((word) =>
      normalizeToken(word, profile.locale)
    );

    if (termTokens.length === 0) return;

    for (let index = 0; index <= tokens.length - termTokens.length; index += 1) {
      const matches = termTokens.every(
        (termToken, termIndex) => tokens[index + termIndex] === termToken
      );
      if (matches) count += 1;
    }
  });

  return count;
}

function detectLanguage(text: string) {
  const candidates = (Object.keys(LANGUAGE_PROFILES) as ResumeLanguage[]).map((code) => {
    const profile = LANGUAGE_PROFILES[code];
    const tokens = getWords(text, profile.locale).map((word) =>
      normalizeToken(word, profile.locale)
    );
    const stopWordHits = tokens.reduce(
      (count, token) => count + (profile.stopWords.has(token) ? 1 : 0),
      0
    );
    const sectionHits = detectSections(text, profile).length;

    return {
      code,
      score: stopWordHits + sectionHits * 4,
    };
  });

  const ranked = candidates.sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const runnerUp = ranked[1];

  if (!best || best.score === 0) {
    return { language: 'en' as ResumeLanguage, confidence: 0 };
  }

  return {
    language: best.code,
    confidence: clamp((best.score - (runnerUp?.score ?? 0)) / Math.max(best.score, 1), 0, 1),
  };
}

function resolveLanguage(text: string, selection: LanguageSelection) {
  if (selection !== 'auto') {
    return {
      language: selection,
      profile: LANGUAGE_PROFILES[selection],
      source: 'manual' as const,
      confidence: 1,
    };
  }

  const detection = detectLanguage(text);
  return {
    language: detection.language,
    profile: LANGUAGE_PROFILES[detection.language],
    source: 'auto' as const,
    confidence: detection.confidence,
  };
}

function countEnglishSyllables(word: string) {
  const normalized = word
    .toLowerCase()
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '');

  const matches = normalized.match(/[aeiouy]{1,2}/g);
  return Math.max(matches?.length ?? 0, 1);
}

function countSyllables(word: string, profile: LanguageProfile) {
  const normalized = normalizeToken(word, profile.locale).replace(/[^\p{L}]/gu, '');
  if (!normalized) return 1;

  if (profile.code === 'en') {
    return countEnglishSyllables(normalized);
  }

  const vowelPattern = profile.code === 'tr' ? /[aeıioöuü]/gu : /[aeiouyäöü]+/gu;
  return Math.max(normalized.match(vowelPattern)?.length ?? 0, 1);
}

function scoreReadability(
  readabilityScore: number,
  averageSentenceLength: number,
  language: ResumeLanguage
) {
  const easyRange = {
    en: { min: 45, max: 80 },
    tr: { min: 50, max: 89 },
    de: { min: 40, max: 70 },
  }[language];
  let score = 0;

  if (readabilityScore >= easyRange.min && readabilityScore <= easyRange.max) score += 10;
  else if (readabilityScore >= 30) score += 6;
  else score += 3;

  if (averageSentenceLength >= 8 && averageSentenceLength <= 24) score += 10;
  else if (averageSentenceLength >= 5 && averageSentenceLength <= 30) score += 6;
  else score += 2;

  return clamp(score, 0, 20);
}

function calculateReadability(words: string[], sentences: string[], profile: LanguageProfile) {
  const averageSentenceLength = words.length / Math.max(sentences.length, 1);
  const syllableCount = words.reduce((sum, word) => sum + countSyllables(word, profile), 0);
  const averageSyllablesPerWord = syllableCount / Math.max(words.length, 1);
  const averageWordLength =
    words.reduce((sum, word) => sum + Array.from(word).length, 0) / Math.max(words.length, 1);

  const rawScore =
    profile.code === 'en'
      ? 206.835 - 1.015 * averageSentenceLength - 84.6 * averageSyllablesPerWord
      : profile.code === 'de'
        ? 180 - averageSentenceLength - 58.5 * averageSyllablesPerWord
        : 198.825 - 40.175 * averageSyllablesPerWord - 2.61 * averageSentenceLength;
  const readabilityScore = clamp(rawScore, 0, 100);

  return {
    formula: profile.formula,
    score: Number(readabilityScore.toFixed(1)),
    fleschReadingEase: Number(readabilityScore.toFixed(1)),
    averageSentenceLength: Number(averageSentenceLength.toFixed(1)),
    averageWordLength: Number(averageWordLength.toFixed(1)),
    averageSyllablesPerWord: Number(averageSyllablesPerWord.toFixed(2)),
    points: scoreReadability(readabilityScore, averageSentenceLength, profile.code),
  };
}

function getSuggestionActionExamples(profile: LanguageProfile) {
  return profile.actionVerbExamples;
}

export function analyzeResumeText(
  text: string,
  pageCount: number,
  jobDescription?: string,
  options: ResumeAnalysisOptions = {}
): ResumeAnalysis {
  const normalizedText = normalizeText(text);
  const requestedLanguage = options.resumeLanguage ?? 'en';
  const languageResolution = resolveLanguage(normalizedText, requestedLanguage);
  const profile = languageResolution.profile;
  const words = getWords(normalizedText, profile.locale);
  const sentences = getSentences(normalizedText, profile.locale);
  const bulletCount = (normalizedText.match(/^[\s]*[-*•‣▪◦]\s+/gm) ?? []).length;
  const readability = calculateReadability(words, sentences, profile);

  const requestedJobDescriptionLanguage =
    options.jobDescriptionLanguage ??
    (options.resumeLanguage && options.resumeLanguage !== 'auto' ? options.resumeLanguage : 'en');
  const jobDescriptionResolution = jobDescription?.trim()
    ? resolveLanguage(normalizeText(jobDescription), requestedJobDescriptionLanguage)
    : undefined;
  const jobProfile = jobDescriptionResolution?.profile ?? profile;

  const topResumeKeywords = extractKeywords(normalizedText, profile, 12);
  const jobKeywords = jobDescription
    ? extractKeywords(normalizeText(jobDescription), jobProfile, 15)
    : [];
  const resumeKeywordTokens = getKeywordTokens(normalizedText, profile);
  const resumeComparisonKeys = buildComparisonKeySet(resumeKeywordTokens, profile);
  const matchedKeywords = jobKeywords.filter((keyword) =>
    [...getComparisonKeys(keyword, jobProfile)].some((key) => resumeComparisonKeys.has(key))
  );
  const missingJobKeywords = jobKeywords.filter((keyword) => !matchedKeywords.includes(keyword));

  const contactChecks = {
    email: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(normalizedText),
    phone: /(?:\+?\d[\d\s().-]{7,}\d)/.test(normalizedText),
    linkedin: /linkedin\.com\/|linkedin/i.test(normalizedText),
    website: /https?:\/\/|www\.|portfolio|portföy|github\.com\/|gitlab\.com\//i.test(
      normalizedText
    ),
    location: /\bremote\b/i.test(normalizedText) || LOCATION_PATTERN.test(normalizedText),
  };

  const sectionsFound = detectSections(normalizedText, profile);
  const missingSections = SECTION_LABELS.filter((label) => !sectionsFound.includes(label));
  const actionVerbCount = countTermOccurrences(normalizedText, profile.actionVerbs, profile);

  let contactScore = 0;
  if (contactChecks.email) contactScore += 5;
  if (contactChecks.phone) contactScore += 5;
  if (contactChecks.linkedin) contactScore += 4;
  if (contactChecks.website) contactScore += 3;
  if (contactChecks.location) contactScore += 3;

  const sectionsScore = clamp(sectionsFound.length * 4, 0, 20);
  const readabilityScore = readability.points;

  let atsScore = 0;
  if (words.length >= 250 && words.length <= 1100) atsScore += 6;
  else if (words.length >= 150) atsScore += 3;
  if (pageCount <= 2) atsScore += 4;
  else if (pageCount <= 3) atsScore += 2;
  if (bulletCount >= 4) atsScore += 4;
  else if (bulletCount >= 2) atsScore += 2;
  if (actionVerbCount >= 6) atsScore += 3;
  else if (actionVerbCount >= 3) atsScore += 2;
  if (readability.averageWordLength <= 7) atsScore += 3;

  const keywordMatchScore = jobKeywords.length
    ? clamp(Math.round((matchedKeywords.length / jobKeywords.length) * 20), 0, 20)
    : sectionsFound.includes('Skills')
      ? 12
      : 8;

  const overall = clamp(
    Math.round(contactScore + sectionsScore + readabilityScore + atsScore + keywordMatchScore),
    0,
    100
  );

  const suggestions: string[] = [];

  if (!contactChecks.email || !contactChecks.phone) {
    suggestions.push(profile.suggestions.contact);
  }

  if (!sectionsFound.includes('Summary')) {
    suggestions.push(profile.suggestions.summary);
  }

  if (!sectionsFound.includes('Skills')) {
    suggestions.push(profile.suggestions.skills);
  }

  if (bulletCount < 4) {
    suggestions.push(profile.suggestions.bullets);
  }

  if (actionVerbCount < 4) {
    suggestions.push(
      profile.suggestions.actionVerbs.replace('{examples}', getSuggestionActionExamples(profile))
    );
  }

  if (pageCount > 2) {
    suggestions.push(profile.suggestions.pages);
  }

  if (jobKeywords.length > 0 && matchedKeywords.length < Math.ceil(jobKeywords.length * 0.4)) {
    suggestions.push(profile.suggestions.keywords);
  }

  if (words.length < 200) {
    suggestions.push(profile.suggestions.detail);
  }

  if (normalizedText.length < 400) {
    suggestions.push(profile.suggestions.extraction);
  }

  return {
    pageCount,
    text: normalizedText,
    wordCount: words.length,
    sentenceCount: sentences.length,
    bulletCount,
    estimatedReadingMinutes: words.length / 220,
    language: languageResolution.language,
    requestedLanguage,
    languageSource: languageResolution.source,
    languageConfidence: Number(languageResolution.confidence.toFixed(2)),
    jobDescriptionLanguage: jobDescriptionResolution?.language,
    scores: {
      overall,
      contact: contactScore,
      sections: sectionsScore,
      readability: readabilityScore,
      ats: atsScore,
      keywordMatch: keywordMatchScore,
    },
    readability: {
      formula: readability.formula,
      score: readability.score,
      fleschReadingEase: readability.fleschReadingEase,
      averageSentenceLength: readability.averageSentenceLength,
      averageWordLength: readability.averageWordLength,
      averageSyllablesPerWord: readability.averageSyllablesPerWord,
    },
    contactChecks,
    sectionsFound,
    missingSections,
    localizedSectionsFound: sectionsFound.map((section) => profile.sectionLabels[section]),
    localizedMissingSections: missingSections.map((section) => profile.sectionLabels[section]),
    topResumeKeywords,
    jobKeywords,
    matchedKeywords,
    missingJobKeywords,
    actionVerbCount,
    suggestions,
  };
}
