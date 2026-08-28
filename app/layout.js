import './globals.css';
import './admin-ui.css';
import './github-loader.css';
import './project-ux.css';
import './gamification.css';
import './achievements-profile.css';
import './gamification-wow.css';
import './music.css';
import './music-realtime.css';
import './assessment-manager.css';
import './groups-manager.css';
import './teacher-projects.css';

export const dynamic='force-dynamic';
export const revalidate=0;
export const metadata={title:'DevTrack',description:'More than grades. Real progress.'};

export default function RootLayout({children}){
  return <html lang="lv" suppressHydrationWarning><body>{children}</body></html>;
}
