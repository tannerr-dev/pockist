package templates

import (
	"html/template"
	"log"
)

func Templater(s string) *template.Template {
	prefix := "templates/"
	tmp, err := template.ParseFiles(
		prefix+"layouts/base.tmpl",
		prefix+"partials/nav.tmpl",
		prefix+"pages/"+s+".tmpl",
	)
	if err != nil {
		log.Fatalf("Templater error parsing %s template: %v", s, err)
	}
	return tmp
}
