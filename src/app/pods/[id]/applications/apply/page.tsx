'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useEvmAddress, useSignEvmMessage, useCurrentUser } from '@coinbase/cdp-hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/utils/supabaseClient';
import {
  UserPlus,
  Crown,
  Users,
  Clock,
  ArrowLeft,
  CheckCircle,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface Pod {
  id: string;
  name: string;
  description: string;
  pod_leads: string[];
}

interface ExistingApplication {
  id: string;
  status: string;
  intended_role: 'member' | 'leader';
  accountability_statement: string;
  current_votes: number;
  required_votes: number;
  submitted_at: string;
}

export default function ApplyToPodPage() {
  const { id: podId } = useParams();
  const router = useRouter();
  const { evmAddress: address } = useEvmAddress();
  const { currentUser } = useCurrentUser();
  const { signEvmMessage } = useSignEvmMessage();
  const { toast } = useToast();

  const [pod, setPod] = useState<Pod | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'member' | 'leader'>(
    'member',
  );
  const [accountabilityStatement, setAccountabilityStatement] = useState('');
  const [existingApplication, setExistingApplication] =
    useState<ExistingApplication | null>(null);

  useEffect(() => {
    loadPodAndCheckApplication();
  }, [podId, address]);

  const loadPodAndCheckApplication = async () => {
    if (!podId || !address) return;

    try {
      setLoading(true);

      // Load pod details
      const { data: podData, error: podError } = await supabase
        .from('pods')
        .select('id, name, description, pod_leads')
        .eq('id', podId)
        .single();

      if (podError) throw podError;
      setPod(podData);

      // Check for existing application
      const { data: appData, error: appError } = await supabase
        .from('pod_membership_applications')
        .select('*')
        .eq('pod_id', podId)
        .eq('applicant_address', address.toLowerCase())
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!appError && appData) {
        setExistingApplication(appData);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load pod information',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitApplication = async () => {
    if (!address || !pod) return;

    if (!accountabilityStatement.trim()) {
      toast({
        title: 'Required Field',
        description: 'Please provide an accountability statement',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSubmitting(true);

      // Calculate required votes based on role
      const requiredVotes =
        selectedRole === 'leader' ? Math.ceil(pod.pod_leads.length / 2) : 1;

      // Create signature payload
      const signaturePayload = {
        podId: pod.id,
        podName: pod.name,
        intendedRole: selectedRole,
        accountabilityStatement,
        applicantAddress: address,
        timestamp: new Date().toISOString(),
      };

      const messageToSign = JSON.stringify(signaturePayload, null, 2);

      // Check if EVM account is available
      const evmAccount = currentUser?.evmAccounts?.[0];
      if (!evmAccount) {
        toast({
          title: 'Account Not Ready',
          description: 'Your wallet account is still initializing. Please wait and try again.',
          variant: 'destructive',
        });
        return;
      }

      // Request signature
      toast({
        title: 'Please Sign',
        description: 'Please sign your application in your wallet.',
        duration: 3000,
      });

      const result = await signEvmMessage({
        evmAccount: evmAccount as `0x${string}`,
        message: messageToSign,
      });
      const signature = result.signature;

      console.log('✍️ Application signed:', signature);

      // Submit application with signature
      const { data, error } = await supabase
        .from('pod_membership_applications')
        .insert({
          pod_id: pod.id,
          applicant_address: address.toLowerCase(),
          intended_role: selectedRole,
          accountability_statement: accountabilityStatement,
          agreement_signature: signature,
          status: 'pending',
          current_votes: 0,
          required_votes: requiredVotes,
          voting_leaders: [],
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: '✅ Application Submitted!',
        description: `Your ${selectedRole} application has been submitted successfully. Pod leaders will review it soon.`,
        duration: 5000, // Show for 5 seconds
      });

      // Wait a moment before redirecting so user sees the success message
      setTimeout(() => {
        router.push(`/pods/${podId}`);
      }, 1500); // 1.5 second delay
    } catch (error: any) {
      console.error('Error submitting application:', error);
      toast({
        title: 'Submission Failed',
        description: error.message || 'Failed to submit application',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container max-w-3xl mx-auto py-12">
        <div className="flex justify-center items-center h-64">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (!pod) {
    return (
      <div className="container max-w-3xl mx-auto py-12">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-gray-600 mb-4">Pod not found</p>
            <Button onClick={() => router.push('/pods')}>Back to Pods</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!address) {
    return (
      <div className="container max-w-3xl mx-auto py-12">
        <Card>
          <CardContent className="p-8 text-center">
            <UserPlus className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Connect Wallet</h2>
            <p className="text-gray-600 mb-4">
              Please connect your wallet to apply for membership
            </p>
            <Button onClick={() => router.push(`/pods/${podId}`)}>
              Back to Pod
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show existing application status
  if (existingApplication && existingApplication.status !== 'rejected') {
    const roleIcon =
      existingApplication.intended_role === 'leader' ? Crown : Users;
    const roleColor =
      existingApplication.intended_role === 'leader'
        ? 'text-purple-600'
        : 'text-[#2F5D50]';
    const roleBgColor =
      existingApplication.intended_role === 'leader'
        ? 'bg-purple-50'
        : 'bg-[#E8F1EE]';
    const RoleIcon = roleIcon;

    return (
      <div className="container max-w-3xl mx-auto py-12">
        <Button
          variant="ghost"
          onClick={() => router.push(`/pods/${podId}`)}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Pod
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl flex items-center gap-2">
                {existingApplication.status === 'approved' ? (
                  <>
                    <CheckCircle className="h-6 w-6 text-green-600" />
                    Application Approved
                  </>
                ) : (
                  <>
                    <Clock className="h-6 w-6 text-yellow-600" />
                    Application Pending
                  </>
                )}
              </CardTitle>
              <div
                className={`flex items-center gap-2 px-3 py-1 rounded-full ${roleBgColor}`}
              >
                <RoleIcon className={`w-4 h-4 ${roleColor}`} />
                <span className={`text-sm font-medium ${roleColor}`}>
                  {existingApplication.intended_role === 'leader'
                    ? 'Leader'
                    : 'Member'}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="border-l-4 border-yellow-400 pl-4 py-2">
              <p className="text-sm font-medium text-gray-900 mb-1">
                Your Accountability Statement
              </p>
              <p className="text-sm text-gray-700">
                {existingApplication.accountability_statement}
              </p>
            </div>

            {existingApplication.status === 'pending' && (
              <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="flex items-center gap-3">
                  <Clock className="h-6 w-6 text-yellow-600" />
                  <div>
                    <p className="font-medium text-gray-900">
                      Awaiting Leader Votes
                    </p>
                    <p className="text-sm text-gray-600">
                      {existingApplication.current_votes} /{' '}
                      {existingApplication.required_votes} votes received
                    </p>
                  </div>
                </div>
                <div className="flex-1 max-w-xs ml-4">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-yellow-600 h-2 rounded-full transition-all"
                      style={{
                        width: `${(existingApplication.current_votes / existingApplication.required_votes) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {existingApplication.status === 'approved' && (
              <div className="p-4 bg-[#D4E5DF] rounded-lg border border-[#3F7A5A]">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-6 w-6 text-[#3F7A5A]" />
                  <div>
                    <p className="font-medium text-green-900">
                      Application Approved!
                    </p>
                    <p className="text-sm text-green-700">
                      You can now access {pod.name}. Return to the pod page to
                      get started.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs text-gray-500 text-center">
              Submitted{' '}
              {new Date(existingApplication.submitted_at).toLocaleDateString()}
            </p>

            <div className="flex justify-center">
              <Button onClick={() => router.push(`/pods/${podId}`)}>
                Back to {pod.name}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show application form
  return (
    <div className="container max-w-3xl mx-auto py-12">
      <Button
        variant="ghost"
        onClick={() => router.push(`/pods/${podId}`)}
        className="mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Pod
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <UserPlus className="h-6 w-6" />
            Apply to Join {pod.name}
          </CardTitle>
          <p className="text-gray-600 mt-2">{pod.description}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              What role are you applying for?
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setSelectedRole('member')}
                className={`p-4 border-2 rounded-lg transition-all ${
                  selectedRole === 'member'
                    ? 'border-[#2F5D50] bg-[#E8F1EE]'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <Users
                    className={`w-8 h-8 ${selectedRole === 'member' ? 'text-blue-600' : 'text-gray-400'}`}
                  />
                  <span
                    className={`font-medium ${selectedRole === 'member' ? 'text-blue-900' : 'text-gray-700'}`}
                  >
                    Member
                  </span>
                  <span className="text-xs text-gray-500 text-center">
                    Requires 1 leader approval
                  </span>
                </div>
              </button>

              <button
                onClick={() => setSelectedRole('leader')}
                className={`p-4 border-2 rounded-lg transition-all ${
                  selectedRole === 'leader'
                    ? 'border-purple-600 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <Crown
                    className={`w-8 h-8 ${selectedRole === 'leader' ? 'text-purple-600' : 'text-gray-400'}`}
                  />
                  <span
                    className={`font-medium ${selectedRole === 'leader' ? 'text-purple-900' : 'text-gray-700'}`}
                  >
                    Leader
                  </span>
                  <span className="text-xs text-gray-500 text-center">
                    Requires majority vote (
                    {Math.ceil(pod.pod_leads.length / 2)} leaders)
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Accountability Statement */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Accountability Statement <span className="text-red-500">*</span>
            </label>
            <Textarea
              value={accountabilityStatement}
              onChange={(e) => setAccountabilityStatement(e.target.value)}
              rows={6}
              className="w-full"
              placeholder="Tell the pod leaders why you want to join and how you plan to contribute. This statement shows your commitment to the pod's mission and values."
            />
            <p className="text-xs text-gray-500 mt-1">
              Be specific about your skills, experience, and commitment to the
              pod.
            </p>
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleSubmitApplication}
            disabled={submitting || !accountabilityStatement.trim()}
            className="w-full"
            size="lg"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Submitting...
              </>
            ) : (
              <>
                <UserPlus className="w-5 h-5 mr-2" />
                Submit Application
              </>
            )}
          </Button>

          <p className="text-xs text-gray-500 text-center">
            By submitting, you agree to the pod's accountability requirements
            and community guidelines.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
