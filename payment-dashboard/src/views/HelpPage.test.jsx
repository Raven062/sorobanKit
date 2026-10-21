import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import HelpPage from './HelpPage';

const mockFaqItems = [
  { question: 'What are the fees?', answer: 'Fees are 1% per transaction.' },
  { question: 'How do I reset my password?', answer: 'Use the forgot password link.' },
  { question: 'How do I contact support?', answer: 'Email support@example.com.' },
];

describe('HelpPage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders all FAQ items fetched from /faq.json', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockFaqItems),
    });

    render(<HelpPage />);

    await waitFor(() => {
      expect(screen.getByText('What are the fees?')).toBeInTheDocument();
    });

    mockFaqItems.forEach((item) => {
      expect(screen.getByText(item.question)).toBeInTheDocument();
      expect(screen.getByText(item.answer)).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith('/faq.json');
  });

  it('shows a loading state while the fetch is in progress', () => {
    let resolveFetch;
    global.fetch = jest.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    render(<HelpPage />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    resolveFetch({
      ok: true,
      json: () => Promise.resolve(mockFaqItems),
    });
  });

  it('shows an error state when the fetch fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    render(<HelpPage />);

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });
});