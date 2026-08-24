import './globals.css';
import './admin-ui.css';
export const metadata={title:'DevTrack',description:'More than grades. Real progress.'};
export default function RootLayout({children}){return <html lang="lv" suppressHydrationWarning><body>{children}</body></html>}
