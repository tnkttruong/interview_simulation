import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {auth} from "@/server/auth";
import AiSettingsForm from "@/features/AiSettingsForm";
export default async function SettingsPage(){
 const session=await auth.api.getSession({headers:await headers()});
 if(!session)redirect("/signin");
 return <AiSettingsForm email={session.user.email}/>;
}
