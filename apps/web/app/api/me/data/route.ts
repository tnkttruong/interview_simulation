import {NextResponse} from "next/server";
import {z} from "zod";
import {deleteInterviewData} from "@/server/privacy";
import {currentUser,safeError,tracedApi,unauthorized} from "@/server/request";
export const runtime="nodejs";
export async function DELETE(req:Request){
 return tracedApi(req,"data.delete",async()=>{
  const user=await currentUser(req);if(!user)return unauthorized();
  try{
   z.object({confirm:z.literal("DELETE ALL MY INTERVIEW DATA")}).parse(await req.json());
   return NextResponse.json(deleteInterviewData(user.id),{headers:{"Cache-Control":"no-store"}});
  }catch(error){return safeError(error);}
 });
}
