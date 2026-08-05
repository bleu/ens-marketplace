-- CreateTable
CREATE TABLE "FarolListing" (
    "id" SERIAL NOT NULL,
    "orderHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameLength" INTEGER NOT NULL,
    "tokenContract" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "itemType" INTEGER NOT NULL,
    "priceWei" DECIMAL(78,0) NOT NULL,
    "priceCurrency" TEXT NOT NULL,
    "protocolAddress" TEXT NOT NULL,
    "protocolData" JSONB NOT NULL,
    "sellerAddress" TEXT NOT NULL,
    "counter" TEXT NOT NULL,
    "startTime" INTEGER NOT NULL,
    "endTime" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FarolListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FarolListing_orderHash_key" ON "FarolListing"("orderHash");

-- CreateIndex
CREATE INDEX "FarolListing_priceWei_idx" ON "FarolListing"("priceWei");

-- CreateIndex
CREATE INDEX "FarolListing_nameLength_idx" ON "FarolListing"("nameLength");

-- CreateIndex
CREATE INDEX "FarolListing_name_idx" ON "FarolListing"("name");

-- CreateIndex
CREATE INDEX "FarolListing_sellerAddress_idx" ON "FarolListing"("sellerAddress");

-- CreateIndex
CREATE INDEX "FarolListing_endTime_idx" ON "FarolListing"("endTime");
