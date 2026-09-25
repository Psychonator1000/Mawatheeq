import type { Metadata } from 'next';
import '@fontsource-variable/noto-sans-arabic';
import './globals.css';
export const metadata:Metadata={title:'Mawatheeq | مواثيق',description:'مساحة عمل مواثيق للأحكام والتنفيذ والمستندات القانونية',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body>{children}</body></html>}
