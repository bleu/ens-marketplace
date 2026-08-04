-- CreateTable
CREATE TABLE "GrailsListing" (
    "id" SERIAL NOT NULL,
    "orderHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameLength" INTEGER NOT NULL,
    "tokenId" TEXT NOT NULL,
    "priceWei" DECIMAL(78,0) NOT NULL,
    "priceCurrency" TEXT NOT NULL,
    "protocolAddress" TEXT NOT NULL,
    "protocolData" JSONB NOT NULL,
    "sellerAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scrapedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrailsListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GrailsListing_orderHash_key" ON "GrailsListing"("orderHash");

-- CreateIndex
CREATE INDEX "GrailsListing_priceWei_idx" ON "GrailsListing"("priceWei");

-- CreateIndex
CREATE INDEX "GrailsListing_nameLength_idx" ON "GrailsListing"("nameLength");

-- CreateIndex
CREATE INDEX "GrailsListing_name_idx" ON "GrailsListing"("name");
