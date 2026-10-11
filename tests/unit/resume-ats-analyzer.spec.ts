import { test, expect } from '@playwright/test';
import { analyzeResumeText } from '@/lib/utils/resume-ats-analyzer';

const englishResume = `
John Doe
john@example.com | +1 555 123 4567 | linkedin.com/in/johndoe | New York, NY

Summary
Product engineer building reliable web applications.

Experience
- Built customer-facing TypeScript and React features.
- Designed accessible interfaces and optimized page performance.
- Managed delivery with product and design teams.

Education
Bachelor of Science in Computer Science

Skills
TypeScript React Node.js

Projects
Developer tooling dashboard

Certifications
AWS Certified Developer
`;

const turkishResume = `
Ayşe Yılmaz
ayse@example.com | +90 212 555 12 34 | linkedin.com/in/ayseyilmaz
İstanbul, Türkiye

Özet
Ürün geliştirme ve yazılım ekipleriyle çalışma deneyimi.

Deneyim
- Yeni bir raporlama sistemi geliştirdim.
- Proje ekibini yönettim ve kullanıcı deneyimini tasarladım.
- Dağıtım sürecini uyguladım ve performansı artırdım.

Eğitim
Bilgisayar Mühendisliği

Yetenekler
Python, veri analizi, tasarım ve uygulama

Projeler
İş zekâsı platformu

Sertifikalar
Bulut geliştirme sertifikası
`;

const germanResume = `
Max Müller
max@example.de | +49 30 555 1234 | linkedin.com/in/maxmueller
München, Deutschland

Zusammenfassung
Softwareentwickler mit Erfahrung in datengetriebenen Webanwendungen.

Berufserfahrung
- Entwickelt und optimiert interne Plattformen.
- Geleitet ein Team und reduziert die Ladezeit.
- Änderungsmanagement für mehrere Kundenprojekte umgesetzt.

Ausbildung
Masterstudium der Informatik

Fähigkeiten
Python, Datenanalyse, Änderungsmanagement

Projekte
Automatisierte Berichtsanwendung

Zertifikate
Cloud-Zertifizierung
`;

test.describe('ATS analyzer language support', () => {
  test('preserves English behavior and exposes the English readability profile', () => {
    const analysis = analyzeResumeText(
      englishResume,
      1,
      'We need TypeScript and React experience with Python exposure.'
    );

    expect(analysis.language).toBe('en');
    expect(analysis.readability.formula).toBe('Flesch Reading Ease');
    expect(analysis.sectionsFound).toEqual([
      'Summary',
      'Experience',
      'Education',
      'Skills',
      'Projects',
      'Certifications',
    ]);
    expect(analysis.actionVerbCount).toBeGreaterThanOrEqual(4);
    expect(analysis.matchedKeywords).toEqual(expect.arrayContaining(['typescript', 'react']));
    expect(analysis.scores.overall).toBeGreaterThanOrEqual(0);
    expect(analysis.scores.overall).toBeLessThanOrEqual(100);
  });

  test('analyzes Turkish headings, verbs, contacts, stop words, and readability', () => {
    const analysis = analyzeResumeText(
      turkishResume,
      2,
      'Python, veri analizi, tasarım ve geliştirdim deneyimi.',
      { resumeLanguage: 'tr', jobDescriptionLanguage: 'tr' }
    );

    expect(analysis.language).toBe('tr');
    expect(analysis.languageSource).toBe('manual');
    expect(analysis.readability.formula).toBe('Ateşman');
    expect(analysis.sectionsFound).toEqual([
      'Summary',
      'Experience',
      'Education',
      'Skills',
      'Projects',
      'Certifications',
    ]);
    expect(analysis.actionVerbCount).toBeGreaterThanOrEqual(4);
    expect(analysis.contactChecks.email).toBe(true);
    expect(analysis.contactChecks.phone).toBe(true);
    expect(analysis.contactChecks.location).toBe(true);
    expect(analysis.topResumeKeywords).not.toContain('ve');
    expect(analysis.matchedKeywords).toEqual(expect.arrayContaining(['python', 'tasarım']));
  });

  test('analyzes German headings, umlauts, action verbs, compounds, and readability', () => {
    const analysis = analyzeResumeText(
      germanResume,
      2,
      'Python, Datenanalyse, Änderungsmanagement und München.',
      { resumeLanguage: 'de', jobDescriptionLanguage: 'de' }
    );

    expect(analysis.language).toBe('de');
    expect(analysis.readability.formula).toBe('Amstad');
    expect(analysis.sectionsFound).toEqual([
      'Summary',
      'Experience',
      'Education',
      'Skills',
      'Projects',
      'Certifications',
    ]);
    expect(analysis.actionVerbCount).toBeGreaterThanOrEqual(3);
    expect(analysis.contactChecks.location).toBe(true);
    expect(analysis.topResumeKeywords).not.toContain('und');
    expect(analysis.matchedKeywords).toEqual(
      expect.arrayContaining(['änderungsmanagement', 'münchen'])
    );
  });

  test('matches conservative Turkish and German keyword word forms', () => {
    const turkish = analyzeResumeText(
      `
Özet
Yazılım geliştirme deneyimi.

Deneyim
- Geliştirdim ve analizleri yönettim.

Beceriler
Python
`,
      1,
      'Aranan: geliştirme ve analiz.',
      { resumeLanguage: 'tr', jobDescriptionLanguage: 'tr' }
    );

    const german = analyzeResumeText(
      `
Zusammenfassung
Erfahrung in Datenanalyse und Kundenprojekten.

Fähigkeiten
Datenanalyse Kundenprojekt
`,
      1,
      'Gesucht werden Datenanalysen und Kundenprojekt.',
      { resumeLanguage: 'de', jobDescriptionLanguage: 'de' }
    );

    expect(turkish.matchedKeywords).toEqual(expect.arrayContaining(['geliştirme', 'analiz']));
    expect(german.matchedKeywords).toEqual(
      expect.arrayContaining(['datenanalysen', 'kundenprojekt'])
    );
  });

  test('localizes selected-language sections and ATS suggestions', () => {
    const turkish = analyzeResumeText(
      `
Ayşe Yılmaz
ayse@example.com | +90 212 555 12 34

Deneyim
- Geliştirdim bir raporlama sistemi.
`,
      1,
      undefined,
      { resumeLanguage: 'tr' }
    );
    const german = analyzeResumeText(
      `
Max Müller
max@example.de | +49 30 555 1234

Berufserfahrung
- Entwickelt interne Plattformen.
`,
      1,
      undefined,
      { resumeLanguage: 'de' }
    );

    expect(turkish.localizedSectionsFound).toContain('Deneyim');
    expect(turkish.localizedMissingSections).toContain('Özet');
    expect(turkish.suggestions).toContain(
      'Kısa bir özet bölümü ekleyerek işe uygunluğunuzu hızlıca anlatın.'
    );
    expect(german.localizedSectionsFound).toContain('Berufserfahrung');
    expect(german.localizedMissingSections).toContain('Zusammenfassung');
    expect(german.suggestions).toContain(
      'Fügen Sie einen kurzen Abschnitt „Zusammenfassung“ hinzu, damit Recruiter Ihre Eignung schneller verstehen.'
    );
  });

  test('auto-detects Turkish text and manual selection overrides detection', () => {
    const detected = analyzeResumeText(turkishResume, 1, undefined, {
      resumeLanguage: 'auto',
    });
    const overridden = analyzeResumeText(turkishResume, 1, undefined, {
      resumeLanguage: 'de',
    });

    expect(detected.language).toBe('tr');
    expect(detected.languageSource).toBe('auto');
    expect(detected.languageConfidence).toBeGreaterThan(0.5);
    expect(overridden.language).toBe('de');
    expect(overridden.languageSource).toBe('manual');
  });
});

const hasPhone = (text: string) =>
  analyzeResumeText(text, 1, undefined, { resumeLanguage: 'en' }).contactChecks.phone;

test.describe('ATS analyzer phone detection', () => {
  test('finds phone numbers in the usual formats', () => {
    const phones = [
      '+1 555 123 4567',
      '(555) 123-4567',
      '555-123-4567',
      '555.123.4567',
      '+90 (532) 123 45 67',
      '0532 123 45 67',
      '+44 (0)20 7946 0958',
      '05321234567',
      // The no-break spaces a PDF often has between the groups.
      '+1 555 123 4567',
    ];

    for (const phone of phones) {
      expect(hasPhone(`Jane Roe\n${phone}\njane@example.com`), phone).toBe(true);
    }
  });

  // A slash was not a separator, so these fell apart into runs that were too short.
  test('finds German numbers written with a slash', () => {
    expect(hasPhone('Tel.: 030/12345678')).toBe(true);
    expect(hasPhone('Mobil: 0171/1234567')).toBe(true);
    expect(hasPhone('030 / 1234 5678')).toBe(true);
  });

  // Every one of these used to count as a phone number, so a résumé with
  // employment dates and no phone number still got the points for one.
  test('does not take employment dates for a phone number', () => {
    const dates = [
      '2019-2022',
      '2019 - 2022',
      '01/2019 - 03/2022',
      '12.2019 - 03.2022',
      '09/2018 - 06/22',
      '01.03.2019 - 31.12.2021',
      '2015 - 2019 2020 - 2022',
      'Born 15.03.1990',
      '1990-03-15',
      '03/15/1990',
      '2018 - present',
    ];

    for (const date of dates) {
      expect(hasPhone(`Acme Corp\n${date}\nSoftware Engineer`), date).toBe(false);
    }
  });

  test('does not join digits across lines or count short runs', () => {
    expect(hasPhone('2015 - 2019\n2020 - 2022')).toBe(false);
    expect(hasPhone('2019\n2022\n2024')).toBe(false);
    expect(hasPhone('Musterstr. 12 10115 Berlin')).toBe(false);
    expect(hasPhone('GPA 3.85/4.00')).toBe(false);
    expect(hasPhone('')).toBe(false);
  });

  test('still finds the number on a line that also has dates', () => {
    expect(hasPhone('jane@example.com | +1 555 123 4567 | 2019 - 2022')).toBe(true);
    expect(hasPhone('Berlin 10115 +49 30 5551234')).toBe(true);
  });

  test('asks for contact details when the only digits are dates', () => {
    const analysis = analyzeResumeText(
      'Jane Roe\njane@example.com\n\nExperience\nAcme Corp 2019-2022',
      1
    );

    expect(analysis.contactChecks.phone).toBe(false);
    expect(analysis.scores.contact).toBe(5);
    expect(analysis.suggestions).toContain(
      'Add a clearly extractable email address and phone number near the top.'
    );
  });
});

test.describe('ATS analyzer bullets, headings and keywords', () => {
  // Only - * • ‣ ▪ ◦ were counted, so a résumé written in Google Docs (●, ○)
  // or Word (■, –) had "0 bullets" and was told to use more of them.
  test('counts the bullet glyphs word processors use', () => {
    const glyphs = ['-', '*', '•', '‣', '▪', '◦', '●', '○', '■', '◆', '➢', '✓', '–', '—', '·', ''];
    const text = glyphs.map((glyph) => `${glyph} Built a thing`).join('\n');

    expect(analyzeResumeText(text, 1).bulletCount).toBe(glyphs.length);
  });

  test('counts a bullet whose text starts on the next line, and nothing else', () => {
    expect(analyzeResumeText('●\nBuilt a thing\n●\nLed a team', 1).bulletCount).toBe(2);
    expect(
      analyzeResumeText('Plain line\nnot - a bullet\n-nospace\n1. numbered\n2019–2022', 1).bulletCount
    ).toBe(0);
  });

  test('does not suggest more bullets for a résumé bulleted with discs', () => {
    const analysis = analyzeResumeText(
      'Experience\n● Built APIs\n● Led the team\n● Improved latency\n● Shipped features',
      1
    );

    expect(analysis.bulletCount).toBe(4);
    expect(analysis.suggestions).not.toContain(
      'Use more bullet points for achievements instead of dense paragraphs.'
    );
  });

  // "Work Experience" was not among the headings, so the most common résumé
  // heading left the Experience section "missing".
  test('recognizes common English heading variants', () => {
    const analysis = analyzeResumeText(
      [
        'CAREER OBJECTIVE',
        'Ship reliable software.',
        'Work Experience:',
        'Acme Corp',
        'Key Skills',
        'TypeScript',
        'Personal Projects',
        'A side project',
        'Licenses & Certifications',
        'AWS Certified Developer',
      ].join('\n'),
      1
    );

    expect(analysis.sectionsFound).toEqual([
      'Summary',
      'Experience',
      'Skills',
      'Projects',
      'Certifications',
    ]);
    expect(analysis.missingSections).toEqual(['Education']);
  });

  test('finds a heading only on a line of its own', () => {
    const analysis = analyzeResumeText(
      'I have work experience in retail and strong skills in sales.',
      1
    );

    expect(analysis.sectionsFound).toEqual([]);
  });

  // Years and date ranges used to top the keyword list ("2019", "2019-2022"),
  // and a salary or a posting year in the job description counted as a
  // keyword the résumé was missing.
  test('leaves numbers out of the keywords', () => {
    const analysis = analyzeResumeText(
      [
        'Experience',
        'Acme Corp 2019-2022',
        'Built APIs in 2019 and 2020 for 250 clients.',
        'Stored 2019 reports on web3 and .NET.',
      ].join('\n'),
      1,
      'Salary $120,000. Posted 2024. 100% remote. Needs TypeScript, web3 and .NET.'
    );

    const numeric = (keywords: string[]) => keywords.filter((keyword) => !/\p{L}/u.test(keyword));

    expect(numeric(analysis.topResumeKeywords)).toEqual([]);
    expect(numeric(analysis.jobKeywords)).toEqual([]);
    expect(analysis.topResumeKeywords).toEqual(expect.arrayContaining(['acme', 'web3', '.net']));
    expect(analysis.jobKeywords).toEqual(expect.arrayContaining(['typescript', 'web3', '.net']));
    expect(analysis.matchedKeywords).toEqual(expect.arrayContaining(['web3', '.net']));
    expect(analysis.missingJobKeywords).not.toContain('2024');
    expect(analysis.missingJobKeywords).not.toContain('120,000');
  });

  test('handles empty and whitespace-only text without throwing', () => {
    for (const text of ['', '   \n\t  ']) {
      const analysis = analyzeResumeText(text, 1, '   ', { resumeLanguage: 'auto' });

      expect(analysis.wordCount).toBe(0);
      expect(analysis.bulletCount).toBe(0);
      expect(analysis.sectionsFound).toEqual([]);
      expect(analysis.topResumeKeywords).toEqual([]);
      expect(analysis.jobKeywords).toEqual([]);
      expect(analysis.contactChecks.phone).toBe(false);
      expect(analysis.scores.overall).toBeGreaterThanOrEqual(0);
      expect(analysis.scores.overall).toBeLessThanOrEqual(100);
    }
  });
});
