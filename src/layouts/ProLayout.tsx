import { ReactNode } from 'react';
import { ProNavbar } from '@/components/ProNavbar';
import { NoMonetagAds } from '@/components/NoMonetagAds';

interface ProLayoutProps {
  children: ReactNode;
}

export const ProLayout = ({ children }: ProLayoutProps) => {
  return (
    <div className="min-h-screen bg-background">
      <NoMonetagAds />
      <ProNavbar />
      <main className="pt-16">
        {children}
      </main>
    </div>
  );
};
