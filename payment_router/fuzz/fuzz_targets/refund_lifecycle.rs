#![no_main]

use libfuzzer_sys::fuzz_target;
use payment_router::{PaymentRouter, PaymentRouterClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token::{Client as TokenClient, StellarAssetClient},
    Address, Env, Vec,
};

/// Helper to build a deterministic-ish edge-case amount from a raw byte.
fn edge_amount(selector: u8, raw: i128) -> i128 {
    match selector % 6 {
        0 => 0,
        1 => i128::MAX,
        2 => i128::MIN,
        3 => -raw.abs().max(1),
        4 => raw.abs(),
        _ => raw,
    }
}

fuzz_target!(|data: &[u8]| {
    // Need at least a few bytes to drive the scenario.
    if data.len() < 4 {
        return;
    }

    let env = Env::default();
    env.mock_all_auths();

    // Set up token (Stellar asset contract) and the payment router.
    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_id = token_contract.address();
    let token_client = TokenClient::new(&env, &token_id);
    let token_admin_client = StellarAssetClient::new(&env, &token_id);

    let contract_id = env.register_contract(None, PaymentRouter);
    let client = PaymentRouterClient::new(&env, &contract_id);

    // Initialize the router with the token.
    client.initialize(&admin, &token_id);

    // Create a set of users and fund them so refunds can be credited.
    let user_count = ((data[0] % 4) + 1) as usize;
    let mut users: Vec<Address> = Vec::new(&env);
    for _ in 0..user_count {
        let user = Address::generate(&env);
        token_admin_client.mint(&user, &1_000_000_i128);
        users.push_back(user);
    }

    // Credit refund balances by routing payments that will fail / be refunded.
    // We attempt routing to a non-existent recipient path to exercise the
    // refund ledger, then also directly credit via withdraw/claim flows.
    let credit_selector = data[1];
    let credit_amount = edge_amount(credit_selector, i128::from(data[2]) * 1_000);

    for user in users.iter() {
        // Attempt a routing call that may credit a refund balance.
        // Use a small recipient set; failures should be graceful.
        let mut recipients: Vec<(Address, i128)> = Vec::new(&env);
        let recipient = Address::generate(&env);
        recipients.push_back((recipient, credit_amount));
        // Ignore result: routing may legitimately fail (e.g. insufficient balance).
        let _ = client.try_route_payments(&user, &recipients);
    }

    // Now randomly interleave refund operations.
    let mut idx = 3usize;
    let iterations = (data[0] as usize % 8) + 1;
    for _ in 0..iterations {
        if idx >= data.len() {
            break;
        }
        let op = data[idx] % 3;
        let user = users.get((data[idx] as u32) % (user_count as u32)).unwrap();
        idx += 1;

        match op {
            0 => {
                // get_refund_balance should never panic.
                let _ = client.get_refund_balance(&user);
            }
            1 => {
                // withdraw_refund with edge-case amounts.
                let raw = if idx < data.len() {
                    let v = i128::from(data[idx]);
                    idx += 1;
                    v
                } else {
                    0
                };
                let amount = edge_amount(data[(idx.saturating_sub(1)) % data.len()], raw);
                // Must not panic; may return an error gracefully.
                let _ = client.try_withdraw_refund(&user, &amount);
            }
            _ => {
                // claim_all_refunds must not panic, even with amount > balance.
                let _ = client.try_claim_all_refunds(&user);
            }
        }
    }

    // Final invariant: balances are non-negative and token balance is consistent.
    for user in users.iter() {
        if let Ok(balance) = client.try_get_refund_balance(&user) {
            if let Ok(b) = balance {
                assert!(b >= 0, "refund balance must never be negative");
            }
        }
        // Token balance must never be negative.
        let tb = token_client.balance(&user);
        assert!(tb >= 0, "token balance must never be negative");
    }
});