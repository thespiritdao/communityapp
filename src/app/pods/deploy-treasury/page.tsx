'use client';
import { useRouter } from 'next/navigation';
import { ConsolidatedTreasuryDeployer } from '@/features/pods/components/ConsolidatedTreasuryDeployerV2';
import { PodPageLayout } from '@/features/pods/components/PodPageLayout';
import { Button } from '@/components/ui/button';
import { ArrowRight, Wrench } from 'lucide-react';

export default function DeployTreasuryPage() {
  const router = useRouter();

  const redirectToDevTools = () => {
    router.push('/pods/dev-tools?tab=treasury');
  };

  return (
    <PodPageLayout
      title="Deploy Pod Treasuries"
      description="Get your pod treasuries deployed with practical, working solutions that leverage your existing HATS integration."
      showBackButton={true}
    >
      <div className="mb-6 p-4 bg-[#E8F1EE] border border-[#2F5D50] rounded-lg">
        <div className="flex items-start gap-3">
          <Wrench className="h-5 w-5 text-[#2F5D50] mt-0.5" />
          <div>
            <h3 className="font-medium text-[#2F5D50] mb-1">
              Development Tools Available
            </h3>
            <p className="text-[#3A3A3A] text-sm mb-3">
              Treasury deployment is now part of our consolidated development
              tools suite. Access all pod development features in one place.
            </p>
            <Button
              onClick={redirectToDevTools}
              size="sm"
              className="flex items-center gap-2"
            >
              Go to Dev Tools
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <ConsolidatedTreasuryDeployer />
    </PodPageLayout>
  );
}
