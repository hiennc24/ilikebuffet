-- CreateTable
CREATE TABLE "_health_probe" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "_health_probe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "_health_probe_label_key" ON "_health_probe"("label");
