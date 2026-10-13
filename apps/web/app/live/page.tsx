import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {auth} from "@/server/auth";
import LiveWorkspace from "@/features/LiveWorkspace";
export default async function LivePage(){
 const session=await auth.api.getSession({headers:await headers()});
 if(!session)redirect("/signin");
 return <LiveWorkspace email={session.user.email}/>;
}
