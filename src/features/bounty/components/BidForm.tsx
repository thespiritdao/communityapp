"use client"

import React, { useState } from 'react';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Textarea } from 'src/components/ui/textarea';
import { Label } from 'src/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from 'src/components/ui/card';
import { Badge } from 'src/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'src/components/ui/select';
import { Calendar } from 'src/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from 'src/components/ui/popover';
import { CalendarIcon, Plus, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from 'src/lib/utils';

interface Deliverable {
  id: string;
  description: string;
  dueDate: Date;
  paymentAmount: string;
}

interface BountyDetails {
  id: string;
  title: string;
  description: string;
  category: string;
  value: {
    amount: string;
    token: 'SYSTEM' | 'SELF';
  };
  requirements?: string[];
  questions?: string[];
}

interface BidFormData {
  experience: string;
  planOfAction: string;
  deliverables: Deliverable[];
  timeline: string;
  proposedAmount: string;
  paymentOption: 'completion' | 'milestones' | 'split';
  paymentDetails: {
    upfrontAmount?: string;
    completionAmount?: string;
    milestonePayments?: { [key: string]: string };
  };
  additionalNotes: string;
  answers: Record<string, string>;
}

interface BidFormProps {
  bounty: BountyDetails;
  onSubmit: (bidData: BidFormData) => void;
  onCancel: () => void;
}

export const BidForm: React.FC<BidFormProps> = ({ bounty, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState<BidFormData>({
    experience: '',
    planOfAction: '',
    deliverables: [
      {
        id: Math.random().toString(36).substr(2, 9),
        description: '',
        dueDate: new Date(),
        paymentAmount: '0',
      },
    ],
    timeline: '',
    proposedAmount: bounty.value.amount,
    paymentOption: 'completion',
    paymentDetails: {},
    additionalNotes: '',
    answers: {},
  });

  const [showCalendar, setShowCalendar] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleQuestionAnswer = (question: string, answer: string) => {
    setFormData(prev => ({
      ...prev,
      answers: {
        ...prev.answers,
        [question]: answer
      }
    }));
  };

  const addDeliverable = () => {
    const newDeliverable: Deliverable = {
      id: Math.random().toString(36).substr(2, 9),
      description: '',
      dueDate: new Date(),
      paymentAmount: '0',
    };
    setFormData(prev => ({
      ...prev,
      deliverables: [...prev.deliverables, newDeliverable]
    }));
  };

  const updateDeliverable = (id: string, field: keyof Deliverable, value: any) => {
    setFormData(prev => ({
      ...prev,
      deliverables: prev.deliverables.map(d => 
        d.id === id ? { ...d, [field]: value } : d
      )
    }));
  };

  const removeDeliverable = (id: string) => {
    setFormData(prev => ({
      ...prev,
      deliverables: prev.deliverables.filter(d => d.id !== id)
    }));
  };

  const handlePaymentOptionChange = (option: 'completion' | 'milestones' | 'split') => {
    setFormData(prev => ({
      ...prev,
      paymentOption: option,
      paymentDetails: option === 'split' ? { upfrontAmount: '0', completionAmount: prev.proposedAmount } : {}
    }));
  };

  const calculateMilestonePayments = () => {
    if (formData.paymentOption === 'milestones' && formData.deliverables.length > 0) {
      const totalAmount = parseFloat(formData.proposedAmount);
      const perMilestone = (totalAmount / formData.deliverables.length).toFixed(2);
      
      const milestonePayments: { [key: string]: string } = {};
      formData.deliverables.forEach(d => {
        milestonePayments[d.id] = perMilestone;
      });
      
      setFormData(prev => ({
        ...prev,
        paymentDetails: { milestonePayments }
      }));
    }
  };

  React.useEffect(() => {
    calculateMilestonePayments();
  }, [formData.deliverables.length, formData.paymentOption]);

  return (
    <Card className="w-full max-w-4xl mx-auto bounty-card">
      <CardHeader className="bounty-header">
        <CardTitle className="text-2xl font-bold bounty-title">Submit Bid for: {bounty.title}</CardTitle>
        <div className="flex gap-2 mt-2">
          <Badge variant="outline" className="bounty-category">{bounty.category}</Badge>
          <Badge variant="secondary" className="bounty-value">{bounty.value.amount} {bounty.value.token}</Badge>
        </div>
      </CardHeader>
      <CardContent className="bounty-content">
        <form onSubmit={handleSubmit} className="space-y-6 bounty-form">
          {/* Bounty Summary */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Bounty Details</h3>
            <p className="text-gray-600 mb-2 bounty-description">{bounty.description}</p>
            {bounty.requirements && bounty.requirements.length > 0 && (
              <div className="mt-2">
                <h4 className="font-medium text-sm">Requirements:</h4>
                <ul className="list-disc list-inside text-sm text-gray-600">
                  {Array.isArray(bounty.requirements) && bounty.requirements.map((req, index) => (
                    <li key={index}>{req}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Experience */}
          <div className="space-y-2 form-group">
            <Label htmlFor="experience" className="form-label">Relevant Experience</Label>
            <Textarea
              id="experience"
              value={formData.experience}
              onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
              placeholder="Describe your relevant experience for this bounty..."
              className="form-textarea"
              required
              rows={4}
            />
          </div>

          {/* Plan of Action */}
          <div className="space-y-2 form-group">
            <Label htmlFor="planOfAction" className="form-label">Plan of Action</Label>
            <Textarea
              id="planOfAction"
              value={formData.planOfAction}
              onChange={(e) => setFormData({ ...formData, planOfAction: e.target.value })}
              placeholder="Outline your approach to completing this bounty..."
              className="form-textarea"
              required
              rows={4}
            />
          </div>

          {/* Deliverables with Dates */}
          <div className="space-y-4 form-group">
            <div className="flex justify-between items-center">
              <Label className="form-label inline-block mb-0">Deliverables</Label>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={addDeliverable} 
                className="text-green-600 hover:text-green-700"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            
            {formData.deliverables.map((deliverable, index) => (
              <div key={deliverable.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <h4 className="font-medium">Deliverable {index + 1}</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeDeliverable(deliverable.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm">Description</Label>
                  <Textarea
                    value={deliverable.description}
                    onChange={(e) => updateDeliverable(deliverable.id, 'description', e.target.value)}
                    placeholder="Describe this deliverable..."
                    className="form-textarea"
                    required
                    rows={2}
                  />
                </div>
                
                <div className="flex flex-col gap-4 md:flex-row md:gap-4">
                  <div className="space-y-2 w-full md:w-1/2">
                    <Label className="text-sm">Due Date</Label>
                    <Popover open={showCalendar === deliverable.id} onOpenChange={(open) => setShowCalendar(open ? deliverable.id : null)}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !deliverable.dueDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {deliverable.dueDate ? format(deliverable.dueDate, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 bg-white shadow-lg mx-auto flex justify-center">
                        <Calendar
                          mode="single"
                          selected={deliverable.dueDate}
                          onSelect={(date) => {
                            updateDeliverable(deliverable.id, 'dueDate', date);
                            setShowCalendar(null);
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  <div className="space-y-2 w-full md:w-1/2">
                    <Label className="text-sm">Payment ${bounty.value.token}</Label>
                    <Input
                      type="number"
                      value={deliverable.paymentAmount}
                      onChange={(e) => updateDeliverable(deliverable.id, 'paymentAmount', e.target.value)}
                      placeholder="0"
                      className="form-input"
                      required
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div className="space-y-2 form-group">
            <Label htmlFor="timeline" className="form-label">Overall Timeline</Label>
            <Textarea
              id="timeline"
              value={formData.timeline}
              onChange={(e) => setFormData({ ...formData, timeline: e.target.value })}
              placeholder="Provide your estimated timeline with key milestones..."
              className="form-textarea"
              required
              rows={3}
            />
          </div>

          {/* Payment Options */}
          <div className="space-y-4 form-group">
            <Label className="form-label">Payment Structure</Label>
            <Select value={formData.paymentOption} onValueChange={handlePaymentOptionChange}>
              <SelectTrigger className="form-select bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="completion">Pay on Completion</SelectItem>
                <SelectItem value="milestones">Pay per Milestone</SelectItem>
                <SelectItem value="split">Split Payment (Upfront + Completion)</SelectItem>
              </SelectContent>
            </Select>

            {formData.paymentOption === 'split' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Upfront Amount ({bounty.value.token})</Label>
                  <Input
                    type="number"
                    value={formData.paymentDetails.upfrontAmount || '0'}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      paymentDetails: {
                        ...prev.paymentDetails,
                        upfrontAmount: e.target.value,
                        completionAmount: (parseFloat(prev.proposedAmount) - parseFloat(e.target.value || '0')).toString()
                      }
                    }))}
                    className="form-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Completion Amount ({bounty.value.token})</Label>
                  <Input
                    type="number"
                    value={formData.paymentDetails.completionAmount || formData.proposedAmount}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      paymentDetails: {
                        ...prev.paymentDetails,
                        completionAmount: e.target.value,
                        upfrontAmount: (parseFloat(prev.proposedAmount) - parseFloat(e.target.value || '0')).toString()
                      }
                    }))}
                    className="form-input"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Proposed Amount */}
          <div className="space-y-2 form-group">
            <Label htmlFor="proposedAmount" className="form-label">Total Proposed Amount ({bounty.value.token})</Label>
            <Input
              id="proposedAmount"
              type="number"
              value={formData.proposedAmount}
              onChange={(e) => setFormData({ ...formData, proposedAmount: e.target.value })}
              placeholder={bounty.value.amount}
              className="form-input"
              required
            />
            <p className="text-sm text-gray-500">
              Original bounty amount: {bounty.value.amount} {bounty.value.token}
            </p>
          </div>

          {/* Dynamic Questions from Bounty Creator */}
          {bounty.questions && bounty.questions.length > 0 && (
            <div className="space-y-4 form-group">
              <h3 className="font-semibold">Additional Questions</h3>
              {Array.isArray(bounty.questions) && bounty.questions.map((question, index) => (
                <div key={index} className="space-y-2">
                  <Label htmlFor={`question-${index}`} className="form-label">{question}</Label>
                  <Textarea
                    id={`question-${index}`}
                    value={formData.answers[question] || ''}
                    onChange={(e) => handleQuestionAnswer(question, e.target.value)}
                    placeholder="Your answer..."
                    className="form-textarea"
                    required
                    rows={2}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Additional Notes */}
          <div className="space-y-2 form-group">
            <Label htmlFor="additionalNotes" className="form-label">Additional Notes</Label>
            <Textarea
              id="additionalNotes"
              value={formData.additionalNotes}
              onChange={(e) => setFormData({ ...formData, additionalNotes: e.target.value })}
              placeholder="Any additional information you'd like to share..."
              className="form-textarea"
              rows={3}
            />
          </div>

          {/* Form Actions */}
          <div className="flex gap-4 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1 bounty-btn secondary">
              Cancel
            </Button>
            <Button type="submit" className="flex-1 bounty-btn primary" style={{ backgroundColor: '#bfe7c6', color: '#000' }}>
              Submit Bid
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}; 