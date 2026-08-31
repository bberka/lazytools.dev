import { test, expect } from '@playwright/test';
import { analyzeResumeText } from '../src/lib/utils/resume-ats-analyzer';

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

  test('lets users choose résumé and job-description analysis languages', async ({ page }) => {
    await page.goto('/tools/resume-ats-analyzer');

    const resumeLanguage = page.getByRole('combobox', { name: 'Resume language' });
    const jobDescriptionLanguage = page.getByRole('combobox', {
      name: 'Job description language',
    });

    await expect(resumeLanguage).toBeVisible();
    await expect(jobDescriptionLanguage).toBeVisible();

    await resumeLanguage.click();
    await page.getByRole('option', { name: 'Türkçe' }).click();
    await expect(resumeLanguage).toContainText('Türkçe');

    await jobDescriptionLanguage.click();
    await page.getByRole('option', { name: 'Deutsch' }).last().click();
    await expect(jobDescriptionLanguage).toContainText('Deutsch');
  });
});
