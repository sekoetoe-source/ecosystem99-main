-- Create traktir_transactions table
CREATE TABLE IF NOT EXISTS public.traktir_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mayar_invoice_id TEXT UNIQUE,
    donor_name TEXT NOT NULL DEFAULT 'Donatur Kopi',
    donor_email TEXT,
    donor_mobile TEXT,
    amount NUMERIC NOT NULL CHECK (amount >= 1000),
    payment_method TEXT DEFAULT 'Mayar PG',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
    pay_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expired_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '15 minutes')
);

-- Function to auto cancel pending transactions older than 15 minutes
CREATE OR REPLACE FUNCTION public.cancel_expired_traktir_transactions()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_count INT := 0;
BEGIN
    UPDATE public.traktir_transactions
    SET status = 'cancelled', updated_at = now()
    WHERE status = 'pending' AND expired_at <= now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_expired_traktir_transactions() TO anon, authenticated;

-- Enable RLS
ALTER TABLE public.traktir_transactions ENABLE ROW LEVEL SECURITY;

-- Allow public read access to success transactions for aggregated statistics
CREATE POLICY "Public read success traktir_transactions"
    ON public.traktir_transactions
    FOR SELECT
    USING (status = 'success');

-- Allow admins full access to traktir_transactions
CREATE POLICY "Admin full access traktir_transactions"
    ON public.traktir_transactions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- Trigger for auto updating updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_traktir_updated_at ON public.traktir_transactions;
CREATE TRIGGER set_traktir_updated_at
    BEFORE UPDATE ON public.traktir_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- RPC function to get public traktir summary statistics
CREATE OR REPLACE FUNCTION public.get_traktir_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_total_amount NUMERIC := 0;
    v_total_count INT := 0;
    v_hosting_amount NUMERIC := 0;
    v_reward_amount NUMERIC := 0;
    v_maintenance_amount NUMERIC := 0;
BEGIN
    SELECT COALESCE(SUM(amount), 0), COUNT(*)
    INTO v_total_amount, v_total_count
    FROM public.traktir_transactions
    WHERE status = 'success';

    v_hosting_amount := ROUND(v_total_amount * 0.50, 0);
    v_reward_amount := ROUND(v_total_amount * 0.40, 0);
    v_maintenance_amount := ROUND(v_total_amount * 0.10, 0);

    RETURN jsonb_build_object(
        'total_amount', v_total_amount,
        'total_count', v_total_count,
        'hosting_amount', v_hosting_amount,
        'reward_amount', v_reward_amount,
        'maintenance_amount', v_maintenance_amount,
        'hosting_pct', 50,
        'reward_pct', 40,
        'maintenance_pct', 10
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_traktir_stats() TO anon, authenticated;

-- Insert initial Mayar transactions from dashboard export
INSERT INTO public.traktir_transactions (
    mayar_invoice_id,
    donor_name,
    donor_email,
    donor_mobile,
    amount,
    payment_method,
    status,
    pay_url,
    created_at,
    updated_at
) VALUES 
('INV-05e5c3', 'Donatur Kopi', 'donatur@smpn99.sch.id', '081234567890', 1000, 'QRIS', 'success', NULL, '2026-08-17 11:56:04+07', '2026-08-17 11:56:04+07'),
('INV-e21763', 'Donatur Kopi', 'donatur@smpn99.sch.id', '081234567890', 1000, 'QRIS', 'success', NULL, '2026-08-17 11:14:06+07', '2026-08-17 11:14:06+07'),
('INV-007bdb', 'Donatur Kopi', 'donatur@smpn99.sch.id', '081234567890', 3000, 'QRIS', 'success', NULL, '2026-08-17 11:09:58+07', '2026-08-17 11:09:58+07')
ON CONFLICT (mayar_invoice_id) DO UPDATE 
SET status = EXCLUDED.status, amount = EXCLUDED.amount, updated_at = now();

