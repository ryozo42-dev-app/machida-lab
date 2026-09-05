CREATE TABLE "email_otp_challenges" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "challenge_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "consumed_at" TIMESTAMP(6),
    "invalidated_at" TIMESTAMP(6),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_sent_at" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_otp_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_otp_challenges_challenge_token_hash_key" ON "email_otp_challenges"("challenge_token_hash");

CREATE INDEX "idx_email_otp_challenges_user_id" ON "email_otp_challenges"("user_id");

CREATE INDEX "idx_email_otp_challenges_expires_at" ON "email_otp_challenges"("expires_at");

ALTER TABLE "email_otp_challenges" ADD CONSTRAINT "email_otp_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
