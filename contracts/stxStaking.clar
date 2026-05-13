;; ================================================
;; STX Yield Vault
;; Users deposit STX to earn yield rewards
;; Rewards distributed periodically by admin
;; Users request withdrawal, admin processes
;; Minimum deposit: any amount > 0
;; ================================================

(define-constant ERR_INVALID_AMOUNT (err u101))
(define-constant ERR_NOT_OWNER      (err u102))
(define-constant ERR_NO_DEPOSIT     (err u103))
(define-constant ERR_PAUSED         (err u104))
(define-constant ERR_INVALID_OWNER  (err u105))
(define-constant ERR_NO_REQUEST     (err u106))

(define-constant CONTRACT_PRINCIPAL .stx-staking)
(define-constant REWARD_PRECISION u1000000)

;; Data
(define-map deposits principal uint)
(define-map reward-debt principal uint)
(define-map accrued-rewards principal uint)
(define-map pending-withdrawals principal bool)

(define-data-var total-deposited uint u0)
(define-data-var total-rewards uint u0)
(define-data-var reward-per-token uint u0)
(define-data-var unallocated-rewards uint u0)
(define-data-var paused bool false)
(define-data-var vault-owner principal tx-sender)

(define-private (assert-not-paused)
  (begin
    (asserts! (not (var-get paused)) ERR_PAUSED)
    (ok true)))

(define-private (assert-owner)
  (begin
    (asserts! (is-eq tx-sender (var-get vault-owner)) ERR_NOT_OWNER)
    (ok true)))

(define-private (distribute-rewards (amount uint))
  (if (> (var-get total-deposited) u0)
      (begin
        (var-set reward-per-token
          (+ (var-get reward-per-token)
             (/ (* amount REWARD_PRECISION) (var-get total-deposited))))
        true)
      (begin
        (var-set unallocated-rewards (+ (var-get unallocated-rewards) amount))
        true)))

(define-private (settle-rewards (user principal))
  (let
    (
      (balance (default-to u0 (map-get? deposits user)))
      (rpt (var-get reward-per-token))
      (debt (default-to u0 (map-get? reward-debt user)))
      (accrued (default-to u0 (map-get? accrued-rewards user)))
      (gross (/ (* balance rpt) REWARD_PRECISION))
      (pending (if (> gross debt) (- gross debt) u0))
    )
    (map-set accrued-rewards user (+ accrued pending))
    (map-set reward-debt user gross)
    pending))

;; ===================== DEPOSIT =====================
(define-public (deposit (amount uint))
  (begin
    (try! (assert-not-paused))
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)

    (try! (stx-transfer? amount tx-sender CONTRACT_PRINCIPAL))

    (let ((previous-total (var-get total-deposited)))
      (settle-rewards tx-sender)

      (map-set deposits tx-sender 
        (+ (default-to u0 (map-get? deposits tx-sender)) amount))
      
      (var-set total-deposited (+ (var-get total-deposited) amount))

      (if (and (is-eq previous-total u0) (> (var-get unallocated-rewards) u0))
          (begin
            (distribute-rewards (var-get unallocated-rewards))
            (var-set unallocated-rewards u0))
          true))
    (print {event: "deposit", user: tx-sender, amount: amount})
    (ok true)
  )
)

;; ===================== REQUEST WITHDRAW =====================
(define-public (request-withdraw)
  (let
    (
      (user-deposit (default-to u0 (map-get? deposits tx-sender)))
      (already-requested (default-to false (map-get? pending-withdrawals tx-sender)))
    )
    (try! (assert-not-paused))
    (asserts! (> user-deposit u0) ERR_NO_DEPOSIT)
    (asserts! (not already-requested) ERR_INVALID_AMOUNT) ;; reuse error for already requested

    (map-set pending-withdrawals tx-sender true)
    (print {event: "request-withdraw", user: tx-sender})
    (ok true)
  )
)

;; ===================== OWNER FUNCTIONS =====================
(define-public (add-rewards (amount uint))
  (begin
    (try! (assert-owner))
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (try! (stx-transfer? amount tx-sender CONTRACT_PRINCIPAL))
    (var-set total-rewards (+ (var-get total-rewards) amount))
    (distribute-rewards amount)
    (print {event: "add-rewards", amount: amount})
    (ok true)
  )
)

(define-public (process-withdraw (user principal))
  (begin
    (try! (assert-owner))
    (let
      (
        (user-deposit (default-to u0 (map-get? deposits user)))
        (pending (default-to false (map-get? pending-withdrawals user)))
        (user-reward (begin (settle-rewards user)
                        (default-to u0 (map-get? accrued-rewards user))))
        (total-to-withdraw (+ user-deposit user-reward))
      )
      (asserts! pending ERR_NO_REQUEST)
      (asserts! (> user-deposit u0) ERR_NO_DEPOSIT)

      (as-contract (try! (stx-transfer? total-to-withdraw tx-sender user)))

      (map-set deposits user u0)
      (map-set reward-debt user u0)
      (map-set accrued-rewards user u0)
      (map-set pending-withdrawals user false)
      (var-set total-deposited (- (var-get total-deposited) user-deposit))

      (print {event: "process-withdraw", user: user, principal: user-deposit, rewards: user-reward})
      (ok {
        withdrawn: total-to-withdraw,
        principal: user-deposit,
        rewards: user-reward
      })
    )
  )
)

(define-public (emergency-drain)
  (begin
    (try! (assert-owner))
    (let ((balance (stx-get-balance CONTRACT_PRINCIPAL)))
      (as-contract (try! (stx-transfer? balance tx-sender (var-get vault-owner))))
      (print {event: "emergency-drain", amount: balance})
      (ok balance)
    )
  )
)

(define-public (set-owner (new-owner principal))
  (begin
    (try! (assert-owner))
    (asserts! (not (is-eq new-owner (var-get vault-owner))) ERR_INVALID_OWNER)
    (asserts! (not (is-eq new-owner CONTRACT_PRINCIPAL)) ERR_INVALID_OWNER)
    (var-set vault-owner new-owner)
    (print {event: "set-owner", old-owner: tx-sender, new-owner: new-owner})
    (ok true)
  )
)

(define-public (pause)
  (begin
    (try! (assert-owner))
    (var-set paused true)
    (print {event: "pause", by: tx-sender})
    (ok true)
  )
)

(define-public (unpause)
  (begin
    (try! (assert-owner))
    (var-set paused false)
    (print {event: "unpause", by: tx-sender})
    (ok true)
  )
)

;; Read-only
(define-read-only (get-user-deposit (user principal))
  (ok (default-to u0 (map-get? deposits user))))

(define-read-only (get-total-deposited)
  (ok (var-get total-deposited)))

(define-read-only (get-user-rewards (user principal))
  (ok (default-to u0 (map-get? accrued-rewards user))))

(define-read-only (get-owner)
  (ok (var-get vault-owner)))

(define-read-only (get-paused)
  (ok (var-get paused)))

(define-read-only (get-pending-withdrawal (user principal))
  (ok (default-to false (map-get? pending-withdrawals user))))