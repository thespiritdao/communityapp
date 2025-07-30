"use client"

import React, { useState } from 'react';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Textarea } from 'src/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'src/components/ui/select';
import { Label } from 'src/components/ui/label';
import { useAccount } from 'wagmi';
import { FrontendBounty } from '../types/bounty';

const BASE_CHAIN_ID = 8453; // Base mainnet chain ID

interface BountyFormProps {
  onSubmit: (bounty: Omit<FrontendBounty, 'id' | 'createdAt' | 'onchain_id' | 'status'>) => void;
  categories: string[];
}

export type BountyFormData = Omit<FrontendBounty, 'id' | 'createdAt' | 'onchain_id' | 'status' | 'creator_address'>;

export const BountyForm: React.FC<BountyFormProps> = ({ onSubmit, categories }) => {
  const { address } = useAccount();
  const [formData, setFormData] = useState<BountyFormData>({
    title: '',
    description: '',
    category: '',
    value: {
      amount: '',
      token: 'SYSTEM',
    },
    requirements: [''],
    questions: [''],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const filteredData = {
      ...formData,
      requirements: formData.requirements.filter(req => req.trim() !== ''),
      questions: formData.questions.filter(q => q.trim() !== ''),
    };
    onSubmit(filteredData);
  };

  const addRequirement = () => {
    setFormData(prev => ({
      ...prev,
      requirements: [...(prev.requirements || []), '']
    }));
  };

  const updateRequirement = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      requirements: (prev.requirements || []).map((req, i) => i === index ? value : req)
    }));
  };

  const removeRequirement = (index: number) => {
    setFormData(prev => ({
      ...prev,
      requirements: (prev.requirements || []).filter((_, i) => i !== index)
    }));
  };

  const addQuestion = () => {
    setFormData(prev => ({
      ...prev,
      questions: [...(prev.questions || []), '']
    }));
  };

  const updateQuestion = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      questions: (prev.questions || []).map((q, i) => i === index ? value : q)
    }));
  };

  const removeQuestion = (index: number) => {
    setFormData(prev => ({
      ...prev,
      questions: (prev.questions || []).filter((_, i) => i !== index)
    }));
  };

  const isFormValid = formData.title.trim() && 
                     formData.description.trim() && 
                     formData.category && 
                     formData.value.amount && 
                     parseFloat(formData.value.amount) > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bounty-form">
      <div className="space-y-2 form-group">
        <Label htmlFor="title" className="form-label">Title</Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className="form-input"
          required
        />
      </div>

      <div className="space-y-2 form-group">
        <Label htmlFor="description" className="form-label">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="form-textarea"
          required
        />
      </div>

      <div className="space-y-2 form-group">
        <Label htmlFor="category" className="form-label">Category</Label>
        <Select
          value={formData.category}
          onValueChange={(value) => setFormData({ ...formData, category: value })}
        >
          <SelectTrigger className="form-select">
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent className="bg-white">
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4 form-grid">
        <div className="space-y-2 form-group">
          <Label htmlFor="amount" className="form-label">Amount</Label>
          <Input
            id="amount"
            type="number"
            value={formData.value.amount}
            onChange={(e) =>
              setFormData({
                ...formData,
                value: { ...formData.value, amount: e.target.value },
              })
            }
            className="form-input"
            required
          />
        </div>

        <div className="space-y-2 form-group">
          <Label htmlFor="token" className="form-label">Token</Label>
          <Select
            value={formData.value.token}
            onValueChange={(value: 'SYSTEM' | 'SELF') =>
              setFormData({
                ...formData,
                value: { ...formData.value, token: value },
              })
            }
          >
            <SelectTrigger className="form-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="SYSTEM">SYSTEM</SelectItem>
              <SelectItem value="SELF">SELF</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Requirements */}
      <div className="space-y-4 form-group">
        <div className="flex justify-between items-center">
          <Label className="form-label">Requirements</Label>
          <Button type="button" variant="outline" size="sm" onClick={addRequirement} className="bounty-btn primary">
            Add Requirement
          </Button>
        </div>
        {(formData.requirements || []).map((requirement, index) => (
          <div key={index} className="flex gap-2">
            <Input
              value={requirement}
              onChange={(e) => updateRequirement(index, e.target.value)}
              placeholder="Enter a requirement..."
              className="form-input"
            />
            {(formData.requirements || []).length > 1 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => removeRequirement(index)}
                className="bounty-btn primary"
              >
                Remove
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* Questions */}
      <div className="space-y-4 form-group">
        <div className="flex justify-between items-center">
          <Label className="form-label">Questions for Bidders</Label>
          <Button type="button" variant="outline" size="sm" onClick={addQuestion} className="bounty-btn primary">
            Add Question
          </Button>
        </div>
        {(formData.questions || []).map((question, index) => (
          <div key={index} className="flex gap-2">
            <Input
              value={question}
              onChange={(e) => updateQuestion(index, e.target.value)}
              placeholder="Enter a question for bidders..."
              className="form-input"
            />
            {(formData.questions || []).length > 1 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => removeQuestion(index)}
                className="bounty-btn primary"
              >
                Remove
              </Button>
            )}
          </div>
        ))}
      </div>

      <Button
        type="submit"
        className="w-full bounty-btn primary"
        disabled={!isFormValid}
      >
        Create Bounty
      </Button>
    </form>
  );
}; 