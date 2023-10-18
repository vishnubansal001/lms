import Mux from "@mux/mux-node";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import cloudinary from "cloudinary";
import { db } from "@/lib/db";
import fs from "fs";
import file from "@/public/logo.svg";
import { createCanvas, loadImage } from "canvas";

const { Video } = new Mux(
  process.env.MUX_TOKEN_ID!,
  process.env.MUX_TOKEN_SECRET!
);

cloudinary.v2.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET,
});

export async function DELETE(
  req: Request,
  { params }: { params: { courseId: string } }
) {
  try {
    const { userId } = auth();

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const course = await db.course.findUnique({
      where: {
        id: params.courseId,
        userId: userId,
      },
      include: {
        chapters: {
          include: {
            muxData: true,
          },
        },
      },
    });

    if (!course) {
      return new NextResponse("Not found", { status: 404 });
    }

    for (const chapter of course.chapters) {
      if (chapter.muxData?.assetId) {
        await Video.Assets.del(chapter.muxData.assetId);
      }
    }

    const deletedCourse = await db.course.delete({
      where: {
        id: params.courseId,
      },
    });

    return NextResponse.json(deletedCourse);
  } catch (error) {
    console.log("[COURSE_ID_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { courseId: string } }
) {
  try {
    const { userId } = auth();
    const { courseId } = params;
    const values = await req.json();

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (values?.isBadge === true) {
      const canvas = createCanvas(300, 150);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#FFD700";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = "24px Arial";
      ctx.fillStyle = "#000000";
      ctx.fillText("Badge", 50, 75);
      const base64Image = canvas.toDataURL("image/png");

      cloudinary.v2.uploader.upload(
        base64Image,
        { folder: "uploads" },
        async (error, result) => {
          if (error) {
            console.error("Error uploading image:", error);
          } else {
            const url = result?.secure_url;
            console.log("Image uploaded successfully:", url);
            const badge = await db.badge.create({
              data: {
                imageUrl: url || "",
                courseId: courseId,
              },
            });

            await db.course.update({
              where: { id: courseId },
              data: { isBadge: true, badgeId: badge.id },
            });
            console.log("badge created");
          }
        }
      );
    } else if (values?.isBadge === false) {
      const badge = await db.badge.findUnique({
        where: { courseId: courseId },
      });
      if (badge) {
        await db.badge.delete({ where: { id: badge.id } });
        
        await db.course.update({
          where: { id: courseId },
          data: { isBadge: false, badgeId: null },
        });
        console.log("badge deleted");
      }
    }
    const course = await db.course.update({
      where: {
        id: courseId,
        userId,
      },
      data: {
        ...values,
      },
    });

    return NextResponse.json(course);
  } catch (error) {
    console.log("[COURSE_ID]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
