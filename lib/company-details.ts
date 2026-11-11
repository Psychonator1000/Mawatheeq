// A client company's own details as its claims always state them (owner, 11 November 2026: «if the file comes from
// Ooredoo then always have this»). They are the company's public registration details, not case data, and they take
// the place of whatever the file holds for these fields when the claim is made.
export type CompanyDetails = { companyAddress: string; email: string; companyCivil: string; companyRegister: string };

const COMPANIES: { match: RegExp; details: CompanyDetails }[] = [
  {
    // «الشركة الوطنية للاتصالات المتنقلة» (Ooredoo), however the name is written.
    match: /الوطني[ةه]\s*للاتصالات|اوريدو|ooredoo/i,
    details: {
      companyAddress: 'المرقاب، قطعة (1)، شارع السور، قسيمة (800014)، الدور الأرضي، الرقم الآلي للعنوان (19741722)',
      email: 'Ooredoo_Official@ooredoo.com.kw',
      companyCivil: '1579527',
      companyRegister: '73211',
    },
  },
];

export function companyDetails(company: string): CompanyDetails | undefined {
  const name = String(company || '').replace(/[أإآ]/g, 'ا');
  return COMPANIES.find(c => c.match.test(name))?.details;
}
