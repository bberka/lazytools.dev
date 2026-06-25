import { HomeIntro } from '@/components/HomeIntro';
import { HomeContent } from '@/components/HomeContent';

export default function HomePage() {
  return (
    <div className="space-y-4 sm:space-y-8">
      <HomeIntro />
      <HomeContent />
    </div>
  );
}
